import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { extendedExpiry } from "./plans";
import type { PaidCharge } from "./paystack";

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
    const current = (u.planExpiresAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
    // paying for a different plan than the one still running starts from now instead of stacking
    const expires = extendedExpiry(u.plan === charge.plan ? current : 0, charge.term);
    t.set(payRef, { ...charge, name: String(u.displayName || ""), at: Timestamp.now(), expiresAt: Timestamp.fromMillis(expires) });
    t.update(userRef, { plan: charge.plan, planTerm: charge.term, planExpiresAt: Timestamp.fromMillis(expires) });
    return true;
  });
}
