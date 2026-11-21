import { rankEntries, type WeeklyEntry } from "./week";

export const HALL_SIZE = 10;
export const HALL_WEEKS = 12;

export interface Winner {
  rank: number;
  uid: string;
  xp: number;
  displayName: string;
  username: string | null;
  photoURL: string | null;
}

export interface WinnerProfile {
  displayName: string;
  username: string | null;
  photoURL: string | null;
  showOnLeaderboard: boolean;
}

/**
 * The hall-of-fame list for one finished week: ranked by XP gained that week (ties: earlier to reach it wins),
 * only learners who earned XP and did not opt out of leaderboards, top `size`. Ranks are 1..n among the visible.
 */
export function buildHallOfFame(entries: WeeklyEntry[], profiles: Map<string, WinnerProfile>, size = HALL_SIZE): Winner[] {
  const visible = entries.filter((e) => profiles.get(e.uid)?.showOnLeaderboard);
  return rankEntries(visible)
    .slice(0, size)
    .map((e) => {
      const p = profiles.get(e.uid)!;
      return { rank: e.rank, uid: e.uid, xp: e.xp, displayName: p.displayName, username: p.username, photoURL: p.photoURL };
    });
}
