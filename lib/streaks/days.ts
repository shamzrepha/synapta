/** Day-based streak helpers shared by focus rooms and study groups. Day ids are UTC "YYYY-MM-DD". */

export function dayId(d: Date | number = new Date()): string {
  return new Date(d).toISOString().slice(0, 10);
}

function shiftDay(id: string, delta: number): string {
  const t = Date.parse(`${id}T00:00:00Z`) + delta * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export interface StreakInfo {
  current: number;
  longest: number;
  /** true when today already counts (otherwise the streak is alive but at risk) */
  activeToday: boolean;
}

/**
 * Current streak = consecutive days ending today (or yesterday, so it isn't lost until a day is missed).
 * Longest = longest run anywhere in the list.
 */
export function computeStreak(days: Iterable<string>, today: string = dayId()): StreakInfo {
  const set = new Set(days);
  const activeToday = set.has(today);
  let cursor = activeToday ? today : shiftDay(today, -1);
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor = shiftDay(cursor, -1);
  }
  const sorted = Array.from(set).sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && shiftDay(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest, activeToday };
}
