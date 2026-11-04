import { FEATURES, FEATURE_LABEL, PLANS, nextTier, type FeatureKey, type PlanId } from "./plans";

/** What the "me" endpoint tells the browser about the person's plan (the part the nudges need). */
export interface NudgeInfo {
  enforced: boolean;
  /** whether this plan is paid (a real subscription, a gift or a trial), as opposed to the free tier */
  paid: boolean;
  plan: { id: string; label: string; limits: Record<FeatureKey, number | null> };
  usage: Record<FeatureKey, number>;
  /** when an admin last reset this account (a test account), so notices can show again */
  resetAt: number;
}

export interface Nudge {
  /** stored so the same notice isn't repeated: once per day for a warning, once ever for the welcome */
  key: string;
  title: string;
  message: string;
  everyDay: boolean;
}

const ratio = (used: number, limit: number | null) => (limit === null ? 0 : limit === 0 ? 0 : used / limit);

/**
 * Chooses the one notice worth showing now, or none. Only when plan limits apply to this person:
 *  - a warning when a feature is 80% used up (the worst one first), with the plan to move up to;
 *  - for someone on the free tier, a one-time welcome that says what they have and what upgrading gives.
 */
export function pickNudge(me: NudgeInfo, uid: string): Nudge | null {
  if (!me.enforced) return null;
  const real = PLANS[me.plan.id as PlanId];
  const up = real ? nextTier(me.plan.label === "Free (teacher trial)" ? { ...real, label: me.plan.label } : real) : null;

  let worst: { f: FeatureKey; r: number } | null = null;
  for (const f of FEATURES) {
    const r = ratio(me.usage[f] || 0, me.plan.limits[f]);
    if (r >= 0.8 && (!worst || r > worst.r)) worst = { f, r };
  }
  if (worst && up) {
    const limit = me.plan.limits[worst.f] as number;
    const used = me.usage[worst.f] || 0;
    const left = Math.max(0, limit - used);
    return {
      key: `warn:${me.resetAt}:${worst.f}`,
      title: left === 0 ? "You've used it all" : "Running low",
      message: `You've used ${used} of ${limit} ${FEATURE_LABEL[worst.f].many} this month on ${me.plan.label}. Upgrade to ${up.label} for more.`,
      everyDay: true,
    };
  }
  if (!me.paid && up) {
    return {
      key: `welcome:${uid}:${me.resetAt}`,
      title: `You're on the ${me.plan.label} plan`,
      message: `Everything your teachers publish is free. For your own notes, scans, lessons and practice you get a monthly allowance. ${up.label} (${up.codename}) gives you much more.`,
      everyDay: false,
    };
  }
  return null;
}
