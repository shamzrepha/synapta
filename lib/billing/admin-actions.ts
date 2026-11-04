import { PLANS, type PlanId } from "./plans";

/** When an admin-given plan ends: it extends the same plan from where it currently ends, otherwise it starts today. */
export function grantExpiry(now: number, currentExpiryMs: number, currentPlan: unknown, plan: PlanId, days: number): number {
  const start = currentPlan === plan && currentExpiryMs > now ? currentExpiryMs : now;
  return start + days * 86_400_000;
}

/**
 * Whether a plan fits a person's account type. A teacher's plans give class-building tools a student account can't use,
 * so they are for teacher and admin accounts; student plans and School can go to anyone.
 */
export function planFitsRole(plan: PlanId, role: unknown): boolean {
  return PLANS[plan].audience !== "teacher" || role === "teacher" || role === "admin";
}

/** Case-insensitive "contains" match on the fields an admin would type to find someone. */
export function matchesPerson(q: string, p: { displayName?: string; email?: string; username?: string; uid?: string }): boolean {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return false;
  return [p.displayName, p.email, p.username, p.uid].some((v) => typeof v === "string" && v.toLowerCase().includes(needle));
}
