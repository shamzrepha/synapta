import { isDueStored, newStored, reviewStored, type RatingName, type StoredFsrs } from "@/lib/flashcards/serde";
import type { Activity, Template } from "./activities";
import type { KnowledgeUnit } from "./types";

/** What the app learned from one answer (spec 10.4). */
export interface ActivityResult {
  kuId: string;
  template: Template;
  correct: boolean;
  firstTry: boolean;
  ms: number;
  hintsUsed: number;
  /** the student's own rating, for flip cards */
  selfRating?: RatingName;
}

const SLOW_MS: Record<Template, number> = { flip_recall: 12_000, image_identify: 15_000, mcq: 15_000, cloze: 25_000, ordering: 60_000, matching: 60_000 };

/** Spec 16.2: wrong, Again; right but slow or with a hint, Hard; right, Good; right first time and quick, Easy. */
export function rateFromResult(r: ActivityResult): RatingName {
  if (r.selfRating) return r.selfRating;
  if (!r.correct) return "again";
  if (r.hintsUsed > 0 || r.ms > SLOW_MS[r.template]) return "hard";
  if (r.firstTry && r.ms < SLOW_MS[r.template] / 3) return "easy";
  return "good";
}

export interface StoredCard {
  worldId: string;
  kuId: string;
  fsrs: StoredFsrs;
  /** every template this fact was practised with: mastery needs more than one (spec 16.4) */
  templates: string[];
  lastTemplate?: string;
  successes: number;
}

export function applyResult(card: StoredCard | null, worldId: string, r: ActivityResult, now = new Date()): StoredCard {
  const base: StoredCard = card ?? { worldId, kuId: r.kuId, fsrs: newStored(now), templates: [], successes: 0 };
  const rating = rateFromResult(r);
  return {
    ...base,
    fsrs: reviewStored(base.fsrs, rating, now),
    templates: base.templates.includes(r.template) ? base.templates : [...base.templates, r.template],
    lastTemplate: r.template,
    successes: base.successes + (rating === "again" ? 0 : 1),
  };
}

export type KuState = "new" | "learning" | "review" | "mastered";

/** new, learning, review, mastered: mastered is a stable memory (21+ day stability) with 3+ successes across 2+ templates. */
export function kuState(card: StoredCard | null | undefined): KuState {
  if (!card || card.fsrs.reps === 0) return "new";
  if (card.fsrs.stability >= 21 && card.successes >= 3 && card.templates.length >= 2) return "mastered";
  return card.fsrs.state === 2 ? "review" : "learning";
}
const STATE_VALUE: Record<KuState, number> = { new: 0, learning: 0.3, review: 0.6, mastered: 1 };

/** Zone and node mastery: average of fact mastery, safety-critical facts counting double (spec 16.4). */
export function masteryOf(kus: KnowledgeUnit[], cards: Map<string, StoredCard>): number {
  let sum = 0;
  let weight = 0;
  for (const k of kus) {
    const w = k.critical ? 2 : 1;
    sum += STATE_VALUE[kuState(cards.get(k.id))] * w;
    weight += w;
  }
  return weight ? sum / weight : 0;
}

export interface QueueOptions {
  limit?: number;
  newLimit?: number;
  now?: Date;
}

/**
 * Spec 16.3: today's session. Due facts first (safety-critical, then most overdue), a few new ones, no more than three in
 * a row from one concept, and each fact is asked with a different template from last time, harder as memory stabilises.
 */
export function buildQueue(units: KnowledgeUnit[], activities: Activity[], cards: Map<string, StoredCard>, opts: QueueOptions = {}): Activity[] {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 20;
  const newLimit = opts.newLimit ?? 5;
  const byKu = new Map<string, Activity[]>();
  for (const a of activities) if (a.kuIds.length === 1) byKu.set(a.kuIds[0], [...(byKu.get(a.kuIds[0]) ?? []), a]);

  const due = units
    .filter((u) => u.status === "active" && cards.has(u.id) && isDueStored(cards.get(u.id)!.fsrs, now) && byKu.has(u.id))
    .sort((a, b) => Number(!!b.critical) - Number(!!a.critical) || new Date(cards.get(a.id)!.fsrs.due).getTime() - new Date(cards.get(b.id)!.fsrs.due).getTime());
  const fresh = units.filter((u) => u.status === "active" && !cards.has(u.id) && byKu.has(u.id)).slice(0, newLimit);
  const picked = [...due.slice(0, limit), ...fresh].slice(0, limit + newLimit);

  const pick = (u: KnowledgeUnit): Activity => {
    const options = byKu.get(u.id)!;
    const card = cards.get(u.id);
    const fresh = options.filter((a) => a.template !== card?.lastTemplate);
    const pool = fresh.length ? fresh : options;
    const stable = (card?.fsrs.stability ?? 0) >= 7;
    return [...pool].sort((a, b) => (stable ? b.difficulty - a.difficulty : a.difficulty - b.difficulty) || a.id.localeCompare(b.id))[0];
  };

  // interleave: never more than three in a row from the same concept
  const remaining = [...picked];
  const out: Activity[] = [];
  const conceptRun: string[] = [];
  while (remaining.length) {
    const last = conceptRun[conceptRun.length - 1];
    const run = conceptRun.length >= 3 && conceptRun.slice(-3).every((c) => c === last);
    let idx = remaining.findIndex((u) => !(run && u.conceptId === last));
    if (idx < 0) idx = 0;
    const [u] = remaining.splice(idx, 1);
    out.push(pick(u));
    conceptRun.push(u.conceptId);
  }
  return out;
}

export function dueCount(units: KnowledgeUnit[], cards: Map<string, StoredCard>, now = new Date()): number {
  return units.filter((u) => u.status === "active" && cards.has(u.id) && isDueStored(cards.get(u.id)!.fsrs, now)).length;
}
