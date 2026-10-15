import { weekIdFor } from "@/lib/game/leagues";

/** Pure ISO-week helpers (UTC, weeks start Monday). Week ids look like "2026-W42". */

export { weekIdFor };

export function isWeekId(s: string): boolean {
  return /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(s);
}

/** Monday 00:00 UTC of the given week id. */
export function weekStart(weekId: string): Date {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekId);
  if (!m) throw new Error(`Bad week id: ${weekId}`);
  const year = Number(m[1]);
  const week = Number(m[2]);
  // Jan 4th is always in ISO week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(Date.UTC(year, 0, 4 - (jan4Day - 1)));
  week1Monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return week1Monday;
}

/** Id of the week before `weekId`. */
export function previousWeekId(weekId: string): string {
  const d = weekStart(weekId);
  d.setUTCDate(d.getUTCDate() - 7);
  return weekIdFor(d);
}

/** Id of the week before the one containing `date`. */
export function lastWeekId(date: Date = new Date()): string {
  return previousWeekId(weekIdFor(date));
}

export interface WeeklyEntry {
  uid: string;
  xp: number;
}

/** Sort by XP desc (ties broken by uid so results are stable) and number the rows 1..n. */
export function rankEntries<T extends WeeklyEntry>(entries: T[]): Array<T & { rank: number }> {
  return [...entries]
    .filter((e) => e.xp > 0)
    .sort((a, b) => b.xp - a.xp || a.uid.localeCompare(b.uid))
    .map((e, i) => ({ ...e, rank: i + 1 }));
}

/** The winners of a finished week: top three with XP, only people who earned something. */
export function pickWinners(entries: WeeklyEntry[], count = 3): Array<WeeklyEntry & { rank: number }> {
  return rankEntries(entries).slice(0, count);
}
