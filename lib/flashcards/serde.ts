import { createNewFsrsCard, scheduleCardReview, parseRating, type Card } from "@/lib/fsrs/scheduler";

/** FSRS card as stored in Firestore (dates as ISO strings so it round-trips through JSON). */
export interface StoredFsrs {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string | null;
}

export function toStored(card: Card): StoredFsrs {
  return {
    due: new Date(card.due).toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as number,
    last_review: card.last_review ? new Date(card.last_review).toISOString() : null,
  };
}

export function fromStored(s: StoredFsrs | null | undefined, now = new Date()): Card {
  if (!s || typeof s.due !== "string") return createNewFsrsCard(now);
  return {
    due: new Date(s.due),
    stability: Number(s.stability) || 0,
    difficulty: Number(s.difficulty) || 0,
    elapsed_days: Number(s.elapsed_days) || 0,
    scheduled_days: Number(s.scheduled_days) || 0,
    learning_steps: Number(s.learning_steps) || 0,
    reps: Number(s.reps) || 0,
    lapses: Number(s.lapses) || 0,
    state: (Number(s.state) || 0) as Card["state"],
    ...(s.last_review ? { last_review: new Date(s.last_review) } : {}),
  };
}

export const RATINGS = ["again", "hard", "good", "easy"] as const;
export type RatingName = (typeof RATINGS)[number];

/** Applies a rating to a stored card and returns the new stored state. */
export function reviewStored(s: StoredFsrs | null | undefined, rating: RatingName, now = new Date()): StoredFsrs {
  const { nextCard } = scheduleCardReview(fromStored(s, now), parseRating(rating), now);
  return toStored(nextCard);
}

export function newStored(now = new Date()): StoredFsrs {
  return toStored(createNewFsrsCard(now));
}

export function isDueStored(s: StoredFsrs | null | undefined, now = new Date()): boolean {
  if (!s || !s.due) return true;
  return new Date(s.due).getTime() <= now.getTime();
}
