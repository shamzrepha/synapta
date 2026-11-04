import { adminDb, FieldValue } from "@/lib/firebase/admin";
import { QuotaError } from "@/lib/quota/guard";
import { allowance, billingEnforced, currentPeriod, limitMessage, planOf, type FeatureKey } from "./plans";

/**
 * Per-feature monthly allowances (study notes, scanned pages, lessons...). Two steps so a failed AI call is never charged:
 * `checkFeature` before the work, `recordFeature` after it succeeds. Usage is always counted, so real costs can be studied;
 * a limit only blocks when BILLING_ENFORCED=1.
 */
export async function usageOf(uid: string) {
  const snap = await adminDb().collection("users").doc(uid).get();
  const data = snap.data() || {};
  const period = currentPeriod();
  const usage = ((data.featureUsage || {})[period] || {}) as Partial<Record<FeatureKey, number>>;
  return { data, plan: planOf(data), usage, period };
}

export async function checkFeature(uid: string, feature: FeatureKey, amount = 1): Promise<void> {
  if (!billingEnforced()) return;
  const { plan, usage } = await usageOf(uid);
  const a = allowance(plan, usage, feature, amount);
  if (!a.ok) throw new QuotaError("QUOTA_EXCEEDED", limitMessage(plan, feature, a), 429);
}

export async function recordFeature(uid: string, feature: FeatureKey, amount = 1): Promise<void> {
  try {
    await adminDb()
      .collection("users")
      .doc(uid)
      .update({ [`featureUsage.${currentPeriod()}.${feature}`]: FieldValue.increment(amount) });
  } catch (err) {
    // counting must never fail the request the learner already got their result for
    console.warn("[billing] could not record usage:", err instanceof Error ? err.message : err);
  }
}
