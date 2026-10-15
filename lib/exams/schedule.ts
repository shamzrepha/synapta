/**
 * Deterministic exam revision planner. Pure functions only (no Date.now, no I/O) so it is easy to test.
 * Dates are "YYYY-MM-DD" strings in the student's local calendar.
 */

export interface ExamTopic {
  name: string;
  /** 0..1 probability of mastery when known; weaker topics get more time. */
  mastery?: number | null;
}

export interface PlanItem {
  id: string;
  topic: string;
  minutes: number;
  kind: "learn" | "review";
}

export interface PlanDay {
  date: string;
  items: PlanItem[];
}

export const MIN_SESSION_MINUTES = 10;
/** Review spacing counted backwards from the last study day: 0, 2, 6, 13, 27 days before. */
const REVIEW_OFFSETS = [0, 2, 6, 13, 27];

const DAY_MS = 86400000;

export function isDayString(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Days left until the exam (0 = exam is today, negative = passed). */
export function daysUntil(examDate: string, today: string): number {
  return daysBetween(today, examDate);
}

/** Time weight of a topic: unknown mastery counts as 50%; a weak topic gets up to 3x a mastered one. */
export function topicWeight(mastery: number | null | undefined): number {
  const m = typeof mastery === "number" && Number.isFinite(mastery) ? Math.min(1, Math.max(0, mastery)) : 0.5;
  return 1 + (1 - m) * 2;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "topic";
}

function round5(n: number): number {
  return Math.max(5, Math.round(n / 5) * 5);
}

interface Session {
  topic: string;
  topicIdx: number;
  kind: "learn" | "review";
  minutes: number;
  target: number;
}

/**
 * Study days run from `today` up to the day BEFORE the exam. Each topic gets a first "learn" session,
 * then "review" sessions at expanding intervals counted back from the last study day. Weaker topics get
 * more total minutes. Returns [] when there is no day left to study.
 */
export function buildSchedule(params: {
  today: string;
  examDate: string;
  topics: ExamTopic[];
  minutesPerDay: number;
}): PlanDay[] {
  const { today, examDate } = params;
  const cap = Math.max(15, Math.min(720, Math.round(params.minutesPerDay) || 60));
  const n = daysBetween(today, examDate); // study days: today .. examDate-1
  if (n <= 0) return [];

  const seen = new Set<string>();
  const topics = params.topics.filter((t) => {
    const key = t.name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (topics.length === 0) return [];

  const days: PlanDay[] = Array.from({ length: n }, (_, i) => ({ date: addDays(today, i), items: [] }));
  const load: number[] = new Array(n).fill(0);

  const totalWeight = topics.reduce((s, t) => s + topicWeight(t.mastery), 0);
  const budget = n * cap;

  // 1. Session plan per topic
  const sessions: Session[] = [];
  const T = topics.length;
  topics.forEach((t, ti) => {
    const total = Math.max(MIN_SESSION_MINUTES, (budget * topicWeight(t.mastery)) / totalWeight);
    const maxK = Math.min(REVIEW_OFFSETS.length + 1, n);
    let k = Math.max(Math.ceil(total / cap), Math.min(maxK, Math.round(total / 30)));
    k = Math.max(1, Math.min(maxK, k));
    const per = Math.max(MIN_SESSION_MINUTES, Math.min(cap, round5(total / k)));

    // first (learn) session staggered over the first half of the window
    const learnTarget = n === 1 ? 0 : Math.min(n - 1, Math.floor((ti / T) * Math.max(1, Math.ceil(n / 2))));
    sessions.push({ topic: t.name.trim(), topicIdx: ti, kind: "learn", minutes: per, target: learnTarget });
    for (let m = 0; m < k - 1; m++) {
      const target = Math.max(learnTarget + 1, n - 1 - REVIEW_OFFSETS[m]);
      sessions.push({ topic: t.name.trim(), topicIdx: ti, kind: "review", minutes: per, target: Math.min(n - 1, target) });
    }
  });

  // 2. Pack: learn sessions first (so reviews can follow them), then reviews by target day
  const learnDay = new Map<number, number>();
  const placed = new Map<string, number>();
  const ordered = [...sessions].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "learn" ? -1 : 1;
    return a.target - b.target || a.topicIdx - b.topicIdx;
  });
  for (const s of ordered) {
    const lo = s.kind === "review" ? Math.min(n - 1, (learnDay.get(s.topicIdx) ?? -1) + 1) : 0;
    let best = -1;
    for (let d = 0; d < n && best < 0; d++) {
      const cands = d === 0 ? [s.target] : [s.target + d, s.target - d];
      for (const cand of cands) {
        if (cand < lo || cand >= n) continue;
        if (load[cand] + s.minutes <= cap) {
          best = cand;
          break;
        }
      }
    }
    if (best < 0) best = Math.max(lo, Math.min(n - 1, s.target)); // soft overflow
    load[best] += s.minutes;
    const count = (placed.get(s.topic) ?? 0) + 1;
    placed.set(s.topic, count);
    if (s.kind === "learn") learnDay.set(s.topicIdx, best);
    days[best].items.push({ id: `${slug(s.topic)}-${count}`, topic: s.topic, minutes: s.minutes, kind: s.kind });
  }

  // learn sessions before reviews within a day
  for (const day of days) {
    day.items.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "learn" ? -1 : 1));
  }
  return days;
}

/**
 * Moves unfinished items from days before `today` into the remaining days (least-loaded first, soonest
 * first on ties). Past days keep only what was completed. No-op when there are no remaining days.
 */
export function rescheduleMissed(params: {
  plan: PlanDay[];
  done: Record<string, boolean>;
  today: string;
  minutesPerDay: number;
}): PlanDay[] {
  const { done, today } = params;
  const cap = Math.max(15, params.minutesPerDay || 60);
  const plan: PlanDay[] = params.plan.map((d) => ({ date: d.date, items: d.items.map((i) => ({ ...i })) }));
  const future = plan.filter((d) => d.date >= today);
  if (future.length === 0) return plan;

  const missed: PlanItem[] = [];
  for (const d of plan) {
    if (d.date >= today) continue;
    const keep: PlanItem[] = [];
    for (const it of d.items) (done[it.id] ? keep : missed).push(it);
    d.items = keep;
  }
  const dayLoad = (d: PlanDay) => d.items.filter((i) => !done[i.id]).reduce((s, i) => s + i.minutes, 0);
  for (const it of missed) {
    const sorted = [...future].sort((a, b) => {
      const fa = dayLoad(a) + it.minutes <= cap ? 0 : 1;
      const fb = dayLoad(b) + it.minutes <= cap ? 0 : 1;
      return fa - fb || dayLoad(a) - dayLoad(b) || a.date.localeCompare(b.date);
    });
    sorted[0].items.push(it);
  }
  return plan;
}

export interface PlanProgress {
  totalItems: number;
  doneItems: number;
  totalMinutes: number;
  doneMinutes: number;
  percent: number;
  missedItems: number;
}

export function planProgress(plan: PlanDay[], done: Record<string, boolean>, today: string): PlanProgress {
  let totalItems = 0;
  let doneItems = 0;
  let totalMinutes = 0;
  let doneMinutes = 0;
  let missedItems = 0;
  for (const d of plan) {
    for (const it of d.items) {
      totalItems++;
      totalMinutes += it.minutes;
      if (done[it.id]) {
        doneItems++;
        doneMinutes += it.minutes;
      } else if (d.date < today) missedItems++;
    }
  }
  return { totalItems, doneItems, totalMinutes, doneMinutes, missedItems, percent: totalMinutes ? Math.round((doneMinutes / totalMinutes) * 100) : 0 };
}
