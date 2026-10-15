const DAY = 86400000;

export function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

/** XP price to restore a just-broken streak: longer streaks cost more, within sane bounds. */
export function recoveryCost(streakDays: number): number {
  const s = Math.max(0, Math.floor(streakDays || 0));
  return Math.min(400, Math.max(60, 40 + s * 10));
}

export interface RecoveryState {
  available: boolean;
  cost: number;
  /** The streak that would be restored */
  streak: number;
  /** ISO time when the recovery window closes (end of today, UTC) */
  expiresAt: string | null;
}

/**
 * A streak is "just broken" when exactly one whole day was missed (so the break happened inside
 * the last 24 h), no freeze covered it, and the learner hasn't studied since. Restoring moves
 * lastActiveDate back to yesterday so today's activity continues the old streak.
 */
export function recoveryState(p: {
  streakDays: number;
  lastActiveDate: string | null;
  freezes: number;
  today: string;
}): RecoveryState {
  const none: RecoveryState = { available: false, cost: recoveryCost(p.streakDays), streak: p.streakDays, expiresAt: null };
  if (!p.lastActiveDate || p.streakDays < 2) return none;
  const diff = dayDiff(p.lastActiveDate, p.today);
  if (diff !== 2 || p.freezes > 0) return none;
  return { ...none, available: true, expiresAt: `${addDays(p.today, 1)}T00:00:00.000Z` };
}

/**
 * Which days inside the current streak were bridged by a freeze: walk back from the last active
 * day, counting active days and treating gaps as frozen until the streak length is used up.
 * Days before `since` (the first day we have activity data for) are never marked.
 */
export function inferFrozenDays(p: {
  active: ReadonlySet<string>;
  lastActiveDate: string | null;
  streakDays: number;
  since: string | null;
}): Set<string> {
  const out = new Set<string>();
  if (!p.lastActiveDate || !p.since || p.streakDays < 2) return out;
  let remaining = p.streakDays;
  let day = p.lastActiveDate;
  for (let i = 0; i < 400 && remaining > 0 && day >= p.since; i++) {
    if (!p.active.has(day)) out.add(day);
    remaining--;
    day = addDays(day, -1);
  }
  return out;
}

export type CalendarStatus = "active" | "frozen" | "missed";
export interface CalendarDay {
  date: string;
  status: CalendarStatus;
  today: boolean;
}

export function buildCalendar(p: {
  today: string;
  days?: number;
  active: ReadonlySet<string>;
  frozen: ReadonlySet<string>;
}): CalendarDay[] {
  const n = p.days ?? 30;
  const out: CalendarDay[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = addDays(p.today, -i);
    out.push({
      date,
      today: date === p.today,
      status: p.active.has(date) ? "active" : p.frozen.has(date) ? "frozen" : "missed",
    });
  }
  return out;
}

/** Days until the next freeze is earned (one per 7-day streak). */
export function daysToNextFreeze(streakDays: number, every = 7): number {
  const s = Math.max(0, Math.floor(streakDays || 0));
  return every - (s % every);
}
