/** What the founder can give someone for a good idea or a real bug. */
export const XP_REWARDS = [50, 100, 250, 500] as const;
export const PLAN_DAY_REWARDS = [7, 30, 90] as const;

export type RewardKind = "xp" | "plan_days";

export function validReward(kind: RewardKind, amount: number): boolean {
  return kind === "xp" ? (XP_REWARDS as readonly number[]).includes(amount) : (PLAN_DAY_REWARDS as readonly number[]).includes(amount);
}

/** New expiry for a gift of plan days: from the current expiry if the plan is still running, else from now. */
export function giftedExpiryMs(currentExpiryMs: number, days: number, now = Date.now()): number {
  const base = currentExpiryMs > now ? currentExpiryMs : now;
  return base + days * 86_400_000;
}

export const STATUS_LABEL: Record<string, string> = { new: "New", seen: "Seen", planned: "Planned", done: "Done", declined: "Not now" };

export function rewardLabel(kind: RewardKind, amount: number): string {
  return kind === "xp" ? `${amount} XP` : `${amount} days of the Student plan`;
}
