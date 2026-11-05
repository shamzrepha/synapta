import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FieldPath } from "firebase-admin/firestore";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { PLANS, PLAN_IDS, currentPeriod, planOf, type PlanId } from "@/lib/billing/plans";
import { getBillingConfig, saveBillingConfig } from "@/lib/billing/config";
import { grantExpiry, matchesPerson, planFitsRole } from "@/lib/billing/admin-actions";
import { matchesFilter, parseFilters, sortPeople } from "@/lib/billing/people-browse";

export const runtime = "nodejs";

const ms = (v: unknown) => (v as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;

function describePerson(uid: string, d: FirebaseFirestore.DocumentData, testers: string[]) {
  const plan = planOf(d);
  const exp = ms(d.planExpiresAt);
  return {
    uid,
    name: String(d.displayName || ""),
    email: String(d.email || ""),
    username: String(d.username || ""),
    role: String(d.role || "student"),
    plan: plan.id,
    planLabel: plan.label,
    paid: exp > Date.now() && !!d.plan,
    planExpiresAt: exp > Date.now() && d.plan ? new Date(exp).toISOString() : null,
    grantKind: d.planGrant?.kind ? String(d.planGrant.kind) : null,
    isTester: testers.includes(uid),
    createdAt: ms(d.createdAt),
    xp: typeof d.xp === "number" ? d.xp : 0,
    lastActive: Date.parse(String(d.lastActiveDate || "")) || 0,
  };
}

const SCAN_PAGES = 5; // up to 1,500 accounts are looked at per request
const BROWSE_SHOWN = 50;

/** Finds people by part of their name, username or email (up to 1,500 accounts are searched). */
export async function GET(req: NextRequest) {
  try {
    const admin = await requireUser(req, ["admin"]);
    const limited = await checkRateLimit(req, { uid: admin.uid, keyPrefix: "admin_people", limit: 30, windowMs: 60_000 });
    if (limited) return limited;
    // browse without typing: filter by account type and plan, sorted
    if (req.nextUrl.searchParams.get("browse") === "1") {
      const { role, plan, sort } = parseFilters(req.nextUrl.searchParams);
      const testers = (await getBillingConfig())?.testers ?? [];
      const all: ReturnType<typeof describePerson>[] = [];
      let cursor: string | null = null;
      let capped = false;
      for (let page = 0; page < SCAN_PAGES; page++) {
        let query: FirebaseFirestore.Query = adminDb().collection("users").orderBy(FieldPath.documentId()).limit(300);
        if (cursor) query = query.startAfter(cursor);
        const snap = await query.get();
        for (const doc of snap.docs) all.push(describePerson(doc.id, doc.data(), testers));
        if (snap.docs.length < 300) break;
        cursor = snap.docs[snap.docs.length - 1].id;
        if (page === SCAN_PAGES - 1) capped = true;
      }
      const now = Date.now();
      const matching = sortPeople(all.filter((p) => matchesFilter(p, role, plan, now)), sort);
      return NextResponse.json({ ok: true, data: { people: matching.slice(0, BROWSE_SHOWN), total: matching.length, scanned: all.length, capped } });
    }
    const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 80);
    if (q.length < 2) return NextResponse.json({ ok: true, data: { people: [] } });
    const testers = (await getBillingConfig())?.testers ?? [];
    const found: ReturnType<typeof describePerson>[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5 && found.length < 8; page++) {
      let query: FirebaseFirestore.Query = adminDb().collection("users").orderBy(FieldPath.documentId()).limit(300);
      if (cursor) query = query.startAfter(cursor);
      const snap = await query.get();
      for (const doc of snap.docs) {
        const d = doc.data();
        if (matchesPerson(q, { displayName: d.displayName, email: d.email, username: d.username, uid: doc.id })) found.push(describePerson(doc.id, d, testers));
        if (found.length >= 8) break;
      }
      if (snap.docs.length < 300) break;
      cursor = snap.docs[snap.docs.length - 1].id;
    }
    return NextResponse.json({ ok: true, data: { people: found } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const planId = z.string().refine((v) => (PLAN_IDS as string[]).includes(v) && v !== "free", "Pick a paid plan.");
const schema = z.discriminatedUnion("action", [
  /** a free subscription (kind "gift") or a free trial (kind "trial") for a number of days */
  z.object({ action: z.literal("grant"), uid: z.string().min(1), plan: planId, days: z.number().int().min(1).max(366), kind: z.enum(["gift", "trial"]), note: z.string().trim().max(120).optional(), force: z.boolean().optional() }),
  /** turn the account into a test (dummy) account: no plan, usage reset, limits and the upgrade flow apply to it in "test accounts only" mode */
  z.object({ action: z.literal("test"), uid: z.string().min(1) }),
  z.object({ action: z.literal("untest"), uid: z.string().min(1) }),
  z.object({ action: z.literal("remove"), uid: z.string().min(1) }),
  z.object({ action: z.literal("reset"), uid: z.string().min(1) }),
]);

export async function POST(req: NextRequest) {
  try {
    const admin = await requireUser(req, ["admin"]);
    const body = await parseJson(req, schema);
    const ref = adminDb().collection("users").doc(body.uid);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "No account with that id.");
    const d = snap.data()!;
    const period = currentPeriod();

    if (body.action === "grant") {
      const plan = body.plan as PlanId;
      if (!body.force && !planFitsRole(plan, d.role)) throw new ApiError(409, "ROLE_MISMATCH", `${PLANS[plan].label} is a teacher plan, and this is a ${d.role} account. Choose a student plan, or confirm to give it anyway.`);
      const expires = grantExpiry(Date.now(), ms(d.planExpiresAt), d.plan, plan, body.days);
      await ref.update({ plan, planExpiresAt: Timestamp.fromMillis(expires), planGrant: { kind: body.kind, by: admin.uid, at: Timestamp.now(), note: body.note || "" } });
    } else if (body.action === "remove") {
      await ref.update({ plan: FieldValue.delete(), planExpiresAt: FieldValue.delete(), planTerm: FieldValue.delete(), planGrant: FieldValue.delete() });
    } else if (body.action === "reset") {
      await ref.update({ [`featureUsage.${period}`]: FieldValue.delete(), monthlyTokensUsed: 0, usagePeriod: period, usageResetAt: Timestamp.now() });
    } else {
      const cfg = (await getBillingConfig()) ?? { mode: "off" as const, testers: [] };
      const testers = body.action === "test" ? [...new Set([...cfg.testers, body.uid])] : cfg.testers.filter((t) => t !== body.uid);
      if (testers.length > 50) throw new ApiError(400, "VALIDATION", "Up to 50 test accounts.");
      await saveBillingConfig({ mode: cfg.mode, testers }, admin.uid);
      if (body.action === "test") {
        await ref.update({ plan: FieldValue.delete(), planExpiresAt: FieldValue.delete(), planTerm: FieldValue.delete(), planGrant: { kind: "test", by: admin.uid, at: Timestamp.now(), note: "" }, [`featureUsage.${period}`]: FieldValue.delete(), monthlyTokensUsed: 0, usagePeriod: period, usageResetAt: Timestamp.now() });
      } else {
        await ref.update({ planGrant: FieldValue.delete() });
      }
    }
    const after = (await ref.get()).data()!;
    const testers = (await getBillingConfig())?.testers ?? [];
    return NextResponse.json({ ok: true, data: { person: describePerson(body.uid, after, testers) } });
  } catch (error) {
    return handleAuthError(error);
  }
}
