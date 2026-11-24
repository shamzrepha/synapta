import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { extendedExpiry } from "./plans";
import type { PaidCharge } from "./paystack";
import { commissionFor, HOLD_DAYS } from "@/lib/ambassador/commission";

/**
 * Turns a confirmed payment into a plan, once. Both the signed webhook and the "back from Paystack" check call this, so
 * whichever arrives first activates the plan and the other changes nothing (each payment reference is applied only once).
 */
export async function activatePayment(charge: PaidCharge): Promise<boolean> {
  const db = adminDb();
  const payRef = db.collection("payments").doc(charge.reference);
  const userRef = db.collection("users").doc(charge.uid);
  return db.runTransaction(async (t) => {
    const [pay, user] = await Promise.all([t.get(payRef), t.get(userRef)]);
    if (pay.exists || !user.exists) return false;
    const u = user.data()!;
    // someone who joined through an ambassador's link earns that ambassador a cut (read first: a transaction reads before it writes)
    const referrerId = typeof u.referredBy === "string" && u.referredBy !== charge.uid ? u.referredBy : "";
    const referrerRef = referrerId ? db.collection("users").doc(referrerId) : null;
    const referrer = referrerRef ? await t.get(referrerRef) : null;
    const current = (u.planExpiresAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
    // paying for a different plan than the one still running starts from now instead of stacking
    const expires = extendedExpiry(u.plan === charge.plan ? current : 0, charge.term);
    t.set(payRef, { ...charge, name: String(u.displayName || ""), at: Timestamp.now(), expiresAt: Timestamp.fromMillis(expires) });
    t.update(userRef, { plan: charge.plan, planTerm: charge.term, planExpiresAt: Timestamp.fromMillis(expires) });
    const nth = (typeof u.paymentsCount === "number" ? u.paymentsCount : 0) + 1;
    t.update(userRef, { paymentsCount: nth });
    if (referrerRef && referrer?.exists) {
      const rd = referrer.data()!;
      const paying = typeof rd.payingReferrals === "number" ? rd.payingReferrals : 0;
      const owed = commissionFor(Math.round(charge.amountKobo / 100), nth, paying);
      if (owed > 0) {
        const now = Date.now();
        t.set(db.collection("commissions").doc(charge.reference), {
          ambassadorUid: referrerId,
          payerUid: charge.uid,
          payerName: String(u.displayName || u.username || ""),
          reference: charge.reference,
          nth,
          amountNgn: Math.round(charge.amountKobo / 100),
          commissionNgn: owed,
          status: "held",
          createdAt: Timestamp.fromMillis(now),
          payableAt: Timestamp.fromMillis(now + HOLD_DAYS * 86_400_000),
        });
        if (nth === 1) t.update(referrerRef, { payingReferrals: paying + 1 });
      }
    }
    return true;
  });
}
