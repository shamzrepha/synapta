export const MAX_STREAK_FREEZES = 2;
export const FREEZE_EVERY_DAYS = 7;

/**
 * Daily streak rule with freezes (like Duolingo's streak freeze):
 * - studying again the next day extends the streak;
 * - missing days uses one freeze per missed day if you have enough, keeping the streak alive;
 * - otherwise the streak restarts at 1;
 * - every 7-day milestone earns a freeze (holding at most 2).
 */
export function nextStreak(params: {
  current: number;
  lastActiveDate: string | null; // YYYY-MM-DD (UTC)
  today: string; // YYYY-MM-DD (UTC)
  freezes: number;
}): { streak: number; freezes: number; freezesUsed: number; freezeEarned: boolean } {
  const { current, lastActiveDate, today } = params;
  let freezes = Math.max(0, Math.min(MAX_STREAK_FREEZES, params.freezes || 0));
  if (!lastActiveDate) return { streak: Math.max(1, current || 1), freezes, freezesUsed: 0, freezeEarned: false };
  if (lastActiveDate === today) return { streak: Math.max(1, current), freezes, freezesUsed: 0, freezeEarned: false };

  const diffDays = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastActiveDate}T00:00:00Z`)) / 86400000);
  let streak: number;
  let freezesUsed = 0;
  if (diffDays === 1) {
    streak = current + 1;
  } else if (diffDays > 1 && freezes >= diffDays - 1) {
    freezesUsed = diffDays - 1;
    freezes -= freezesUsed;
    streak = current + 1;
  } else {
    streak = 1;
  }

  let freezeEarned = false;
  if (streak > current && streak % FREEZE_EVERY_DAYS === 0 && freezes < MAX_STREAK_FREEZES) {
    freezes += 1;
    freezeEarned = true;
  }
  return { streak, freezes, freezesUsed, freezeEarned };
}
