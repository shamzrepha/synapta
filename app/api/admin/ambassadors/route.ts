import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { MIN_PAYOUT_NGN } from "@/lib/ambassador/commission";
import { summarise } from "@/lib/ambassador/summary";
import { notify } from "@/lib/notifications/server";
import { writeAudit } from "@/lib/security/audit";

export const runtime = "nodejs";

/** Admin: everyone owed money, with their bank details, largest first. */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    const snap = await adminDb().collection("commissions").limit(2000).get();
    const by = new Map<string, { commissionNgn: number; status: string; payableAtMs: number }[]>();
    for (const d of snap.docs) {
      const x = d.data();
      const list = by.get(String(x.ambassadorUid)) ?? [];
      list.push({ commissionNgn: Number(x.commissionNgn) || 0, status: String(x.status), payableAtMs: x.payableAt?.toMillis?.() ?? 0 });
      by.set(String(x.ambassadorUid), list);
    }
    const out = [];
    for (const [uid, rows] of by) {
      const u = (await adminDb().collection("users").doc(uid).get()).data() || {};
      out.push({ uid, name: String(u.displayName || u.username || ""), email: String(u.email || ""), payout: u.payout ?? null, totals: summarise(rows) });
    }
    out.sort((a, b) => b.totals.payable - a.totals.payable);
    return NextResponse.json({ ok: true, data: { minPayoutNgn: MIN_PAYOUT_NGN, ambassadors: out } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const body = z.object({ action: z.literal("markPaid"), uid: z.string().trim().min(1).max(128) });

/** Admin: after sending the money by bank transfer, mark everything that was payable as paid. */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireUser(req, ["admin"]);
    const b = await parseJson(req, body);
    const snap = await adminDb().collection("commissions").where("ambassadorUid", "==", b.uid).limit(500).get();
    const now = Date.now();
    const due = snap.docs.filter((d) => d.data().status !== "paid" && d.data().status !== "void" && (d.data().payableAt?.toMillis?.() ?? 0) <= now);
    const total = due.reduce((n, d) => n + (Number(d.data().commissionNgn) || 0), 0);
    if (total < MIN_PAYOUT_NGN) throw new ApiError(400, "BELOW_MINIMUM", `Payable balance is ₦${total}, below the ₦${MIN_PAYOUT_NGN} minimum.`);
    const batch = adminDb().batch();
    for (const d of due) batch.update(d.ref, { status: "paid", paidAt: Timestamp.now(), paidBy: admin.uid });
    await batch.commit();
    await notify(b.uid, { type: "system", title: "Ambassador payout sent", body: `₦${total.toLocaleString()} is on its way to your bank account. Thank you for spreading the word!`, href: "/ambassador/dashboard", icon: "gift" }).catch(() => null);
    await writeAudit({ actorUid: admin.uid, actorEmail: admin.email, action: "ambassador.paid", targetType: "user", targetId: b.uid, details: { total, count: due.length } });
    return NextResponse.json({ ok: true, data: { paid: total } });
  } catch (error) {
    return handleAuthError(error);
  }
}
