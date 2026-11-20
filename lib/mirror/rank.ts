import { FORMAT_LABEL, type Format, type MirrorProfile } from "./schema";

/**
 * Contextual-bandit style ranker for the "For you" feed. Deterministic given a seed. No I/O, no AI.
 *
 *   score = 0.60 * need      (mastery gap, or how overdue a review is: the dominant term)
 *         + 0.20 * exam      (exam-date urgency, scaled by the gap)
 *         + 0.12 * pref      (how much this learner finishes this format; neutral until there is evidence)
 *         + 0.08 * explore   (decaying epsilon: try formats we know little about)
 *         - 0.25 if the learner skipped this item before
 *
 * Preference + exploration together can add at most 0.20, while a high-need item is worth at least 0.30 more than a
 * low-need one, so what someone enjoys can never push aside what they most need to learn.
 */
export const WEIGHTS = { need: 0.6, exam: 0.2, pref: 0.12, explore: 0.08 } as const;
export const SKIP_PENALTY = 0.25;
export const MAX_SAME_FORMAT_IN_ROW = 2;
export const DEFAULT_SESSION_CAP = 8;
/** Below this need (and with no exam near) there is nothing worth showing: that is how the feed ends. */
export const MIN_NEED = 0.2;

export type CandidateKind = "due_cards" | "weak_topic" | "lesson" | "lab" | "written" | "quiz" | "podcast";

export interface Candidate {
  id: string;
  kind: CandidateKind;
  format: Format;
  title: string;
  href: string;
  minutes: number;
  /** 0..1 probability of mastery, null when unknown */
  mastery: number | null;
  /** days until the review is due; <= 0 is overdue; null when not scheduled */
  dueDays: number | null;
  /** days to the learner's next exam on this subject; null when none */
  examDays: number | null;
  /** how many items (cards due, etc.) for the why text */
  count?: number;
  topicId?: string;
  topicTitle?: string;
}

export type Reason = "due" | "gap" | "exam" | "preference" | "explore";

export interface RankedItem extends Candidate {
  score: number;
  reason: Reason;
  why: string;
  parts: { need: number; exam: number; pref: number; explore: number };
}

export interface RankContext {
  profile: MirrorProfile;
  /** any string or number; the same seed gives the same feed */
  seed: string | number;
  /** all signals ever seen for this learner (drives how much to explore) */
  totalSignals: number;
  limit?: number;
  /** formats shown just before this feed, oldest first, to keep the diversity rule across calls */
  recentFormats?: readonly Format[];
  skippedIds?: readonly string[];
  doneIds?: readonly string[];
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);
const pct = (m: number) => `${Math.round(m * 100)}%`;

/** mulberry32: tiny seeded PRNG. */
export function seededRng(seed: string | number): () => number {
  let h = 1779033703 ^ String(seed).length;
  for (const ch of String(seed)) {
    h = Math.imul(h ^ ch.charCodeAt(0), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Exploration rate: starts high, decays towards a floor as we learn more about the learner. */
export function epsilon(totalSignals: number): number {
  return 0.15 + 0.85 * Math.pow(0.5, Math.max(0, totalSignals) / 60);
}

export function needOf(c: Candidate): { need: number; due: number; gap: number } {
  const gap = 1 - clamp01(c.mastery ?? 0.5);
  let due = 0;
  if (c.dueDays !== null) {
    if (c.dueDays <= 0) due = Math.min(1, 0.7 + 0.05 * Math.min(6, -c.dueDays));
    else if (c.dueDays <= 2) due = 0.4;
  }
  return { need: Math.max(gap, due), due, gap };
}

export function examUrgency(examDays: number | null, gap: number): number {
  if (examDays === null || examDays < 0) return 0;
  return clamp01(1 / (1 + examDays / 7)) * (0.4 + 0.6 * gap);
}

export function whyText(c: Candidate, reason: Reason): string {
  const label = FORMAT_LABEL[c.format].toLowerCase();
  switch (reason) {
    case "due":
      return c.kind === "due_cards" && c.count
        ? `${c.count} card${c.count === 1 ? " is" : "s are"} due. Reviewing just before you forget is what makes it stick.`
        : `Due for a review${c.dueDays !== null && c.dueDays < 0 ? `, ${-c.dueDays} day${c.dueDays === -1 ? "" : "s"} overdue` : ""}. Reviewing before you forget makes it stick.`;
    case "exam":
      return `Your exam is in ${c.examDays} day${c.examDays === 1 ? "" : "s"} and this topic${c.mastery !== null ? ` is at ${pct(c.mastery)}` : " is still new to you"}.`;
    case "gap":
      return c.mastery !== null ? `One of your weaker topics (${pct(c.mastery)}). A short go now will help most.` : "New to you, so a good place to start.";
    case "preference":
      return `You tend to finish ${label}, and this topic still needs work.`;
    case "explore":
      return `Trying ${label} to learn what works for you. Skip it if it is not helping.`;
  }
}

/**
 * Ranks candidates and returns the next items, best first, respecting the diversity rule and the session cap.
 * The result may be shorter than the cap, or empty: that is the "you're done" state.
 */
export function rankCandidates(candidates: readonly Candidate[], ctx: RankContext): RankedItem[] {
  const rng = seededRng(ctx.seed);
  const limit = Math.max(0, Math.min(ctx.limit ?? DEFAULT_SESSION_CAP, DEFAULT_SESSION_CAP));
  const skipped = new Set(ctx.skippedIds ?? []);
  const done = new Set(ctx.doneIds ?? []);
  const personalised = ctx.profile.personalised;
  const eps = personalised ? epsilon(ctx.totalSignals) : 0;

  const scored: RankedItem[] = [];
  const seenIds = new Set<string>();
  for (const c of candidates) {
    if (done.has(c.id) || seenIds.has(c.id)) continue;
    seenIds.add(c.id);
    const { need, due, gap } = needOf(c);
    const exam = examUrgency(c.examDays, gap);
    if (need < MIN_NEED && exam < 0.3) continue; // nothing to gain here right now
    const f = personalised ? ctx.profile.formats[c.format] : undefined;
    const affinity = f ? f.affinity * f.confidence + 0.5 * (1 - f.confidence) : 0.5;
    const novelty = f ? 1 - f.confidence : 0;
    const explore = eps * (0.6 * novelty + 0.4 * rng());
    const parts = { need: WEIGHTS.need * need, exam: WEIGHTS.exam * exam, pref: WEIGHTS.pref * affinity, explore: WEIGHTS.explore * explore };
    const score = parts.need + parts.exam + parts.pref + parts.explore - (skipped.has(c.id) ? SKIP_PENALTY : 0);

    let reason: Reason;
    if (due >= 0.7 && due >= gap) reason = "due";
    else if (exam >= 0.3) reason = "exam";
    else if (need >= 0.5) reason = "gap";
    else if (parts.explore > parts.pref - WEIGHTS.pref * 0.5 && novelty > 0.5) reason = "explore";
    else reason = "preference";
    if (reason === "gap" && personalised && affinity >= 0.65 && f && f.source !== "not_enough_data" && gap < 0.7) reason = "preference";
    scored.push({ ...c, score, reason, why: whyText(c, reason), parts });
  }
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const out: RankedItem[] = [];
  const tail: Format[] = [...(ctx.recentFormats ?? [])];
  const remaining = scored.slice();
  while (out.length < limit && remaining.length) {
    const idx = remaining.findIndex((c) => {
      const last = tail.slice(-MAX_SAME_FORMAT_IN_ROW);
      return !(last.length === MAX_SAME_FORMAT_IN_ROW && last.every((f) => f === c.format));
    });
    if (idx === -1) break; // only more of the same is left: stop rather than repeat
    const [pick] = remaining.splice(idx, 1);
    out.push(pick);
    tail.push(pick.format);
  }
  return out;
}
