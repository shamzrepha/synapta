import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminAuth, adminDb, Timestamp } from "@/lib/firebase/admin";
import { PLAN_IDS, type PlanId } from "@/lib/billing/plans";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email().optional(),
  uid: z.string().min(1).optional(),
  plan: z.enum(PLAN_IDS as [PlanId, ...PlanId[]]),
  days: z.number().int().min(1).max(366),
});

/** An admin gives someone a plan for a number of days (a school deal, a trial, a transfer payment received by hand). */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req, ["admin"]);
    const body = await parseJson(req, schema);
    let uid = body.uid;
    if (!uid && body.email) {
      try {
        uid = (await adminAuth().getUserByEmail(body.email)).uid;
      } catch {
        throw new ApiError(404, "NOT_FOUND", "No account with that email.");
      }
    }
    if (!uid) throw new ApiError(400, "VALIDATION", "Give an email or a user id.");
    const ref = adminDb().collection("users").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "No account with that id.");
    const current = (snap.data()!.planExpiresAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
    // extend the same plan from its current end; a different plan starts today
    const now = Date.now();
    const start = snap.data()!.plan === body.plan && current > now ? current : now;
    const expires = start + body.days * 86_400_000;
    await ref.update({ plan: body.plan, planExpiresAt: Timestamp.fromMillis(expires), planGrantedBy: caller.uid });
    return NextResponse.json({ ok: true, data: { uid, plan: body.plan, expiresAt: new Date(expires).toISOString() } });
  } catch (error) {
    return handleAuthError(error);
  }
}
