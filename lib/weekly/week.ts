import { weekIdFor, WAT_OFFSET_MS } from "@/lib/game/leagues";

/** Pure ISO-week helpers (weeks start Monday 00:00 West Africa Time, UTC+1). Week ids look like "2026-W42". */

export { weekIdFor };

export function isWeekId(s: string): boolean {
  return /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(s);
}

/** The instant the given week starts: Monday 00:00 WAT, i.e. Sunday 23:00 UTC. */
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
  return new Date(week1Monday.getTime() - WAT_OFFSET_MS);
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
  /** When the learner last gained XP (ms). Their total was reached at that moment, so earlier wins ties. */
  reachedAt?: number;
}

/**
 * Ranks by XP gained that week (a delta, never a lifetime total), highest first. Ties: whoever reached
 * that XP earlier wins; then uid so the order is stable. People with no XP are left out.
 */
export function rankEntries<T extends WeeklyEntry>(entries: T[]): Array<T & { rank: number }> {
  const at = (e: WeeklyEntry) => (typeof e.reachedAt === "number" && Number.isFinite(e.reachedAt) ? e.reachedAt : Number.MAX_SAFE_INTEGER);
  return [...entries]
    .filter((e) => e.xp > 0)
    .sort((a, b) => b.xp - a.xp || at(a) - at(b) || a.uid.localeCompare(b.uid))
    .map((e, i) => ({ ...e, rank: i + 1 }));
}

/** The winners of a finished week: top three with XP, only people who earned something. */
export function pickWinners(entries: WeeklyEntry[], count = 3): Array<WeeklyEntry & { rank: number }> {
  return rankEntries(entries).slice(0, count);
}

/** XP the viewer still needs to pass the person directly above (at least 1: a tie loses to the earlier finisher). */
export function xpToPass(mine: number, above: number | null): number | null {
  if (above === null) return null;
  return Math.max(1, above - mine + 1);
}
