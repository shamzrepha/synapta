import { addDays, dayDiff } from "@/lib/streak/logic";

export type DayCounts = Record<string, number>;

export interface HeatCell {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
  /** false for days after today (rendered as blank) */
  inRange: boolean;
}

/** 0 for no activity, otherwise 1..4 relative to the busiest day in the window. */
export function activityLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (!count || count <= 0) return 0;
  if (max <= 4) return Math.min(4, Math.max(1, Math.round(count))) as 1 | 2 | 3 | 4;
  return Math.min(4, Math.max(1, Math.ceil((4 * count) / max))) as 1 | 2 | 3 | 4;
}

/** Columns of 7 cells (Sunday first), oldest column first, ending with the week containing today. */
export function buildGrid(today: string, counts: DayCounts, weeks = 52): HeatCell[][] {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const start = addDays(today, -(dow + (weeks - 1) * 7));
  const windowDays = weeks * 7;
  let max = 0;
  for (let i = 0; i < windowDays; i++) max = Math.max(max, counts[addDays(start, i)] || 0);
  const grid: HeatCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d);
      const inRange = date <= today;
      const count = inRange ? counts[date] || 0 : 0;
      col.push({ date, count, level: inRange ? activityLevel(count, max) : 0, inRange });
    }
    grid.push(col);
  }
  return grid;
}

export interface HeatSummary {
  total: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
}

export function summarize(counts: DayCounts, today: string, windowDays = 364): HeatSummary {
  const first = addDays(today, -(windowDays - 1));
  const days = Object.keys(counts)
    .filter((d) => d >= first && d <= today && (counts[d] || 0) > 0)
    .sort();
  let total = 0;
  for (const d of days) total += counts[d];

  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    run = prev && dayDiff(prev, d) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }

  // Current streak: counts back from today, or from yesterday if today has no activity yet
  const set = new Set(days);
  let cursor = set.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { total, activeDays: days.length, currentStreak: current, longestStreak: longest };
}

/** Month label for the first column of each month, e.g. { index: 0, label: "Nov" }. */
export function monthLabels(grid: HeatCell[][]): Array<{ index: number; label: string }> {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const out: Array<{ index: number; label: string }> = [];
  let lastMonth = -1;
  grid.forEach((col, i) => {
    const m = Number(col[0].date.slice(5, 7)) - 1;
    if (m !== lastMonth) {
      // skip a label that would collide with the previous one
      if (!out.length || i - out[out.length - 1].index >= 3) out.push({ index: i, label: names[m] });
      lastMonth = m;
    }
  });
  return out;
}
