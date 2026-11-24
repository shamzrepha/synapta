import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { MIN_PAYOUT_NGN, tierFor, TIERS } from "@/lib/ambassador/commission";
import { summarise } from "@/lib/ambassador/summary";

export const runtime = "nodejs";

/** An ambassador's own numbers: link, who joined, what is held, payable and paid. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const db = adminDb();
    const [userSnap, comm] = await Promise.all([
      db.collection("users").doc(caller.uid).get(),
      db.collection("commissions").where("ambassadorUid", "==", caller.uid).limit(500).get(),
    ]);
    const u = userSnap.data() || {};
    const code = String(u.username || caller.uid.slice(0, 8));
    const rows = comm.docs.map((d) => {
      const x = d.data();
      return { commissionNgn: Number(x.commissionNgn) || 0, status: String(x.status), payableAtMs: x.payableAt?.toMillis?.() ?? 0, nth: Number(x.nth) || 1, name: String(x.payerName || "") };
    });
    const paying = typeof u.payingReferrals === "number" ? u.payingReferrals : 0;
    const next = TIERS.find((t) => t.from > paying) ?? null;
    return NextResponse.json({
      ok: true,
      data: {
        code,
        link: `https://sunrootlearn.com/signup?ref=${encodeURIComponent(code)}`,
        joined: typeof u.referralCount === "number" ? u.referralCount : 0,
        paying,
        tier: tierFor(paying).name,
        rate: tierFor(paying).rate,
        nextTier: next ? { name: next.name, at: next.from, rate: next.rate } : null,
        minPayoutNgn: MIN_PAYOUT_NGN,
        totals: summarise(rows),
        payout: u.payout ?? null,
        recent: rows.slice(0, 20),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

const payoutBody = z.object({
  bankName: z.string().trim().min(2).max(60),
  accountNumber: z.string().trim().regex(/^\d{10}$/, "Account numbers are 10 digits"),
  accountName: z.string().trim().min(2).max(80),
});

/** Where to send the money. Only the ambassador and admins ever see it. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "ambassador-payout", limit: 10, windowMs: 60 * 60 * 1000, shared: true });
    if (limited) return limited;
    const b = await parseJson(req, payoutBody);
    await adminDb().collection("users").doc(caller.uid).set({ payout: { ...b, updatedAt: Timestamp.now() } }, { merge: true });
    return NextResponse.json({ ok: true, data: { saved: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
