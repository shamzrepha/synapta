import {
  fsrs,
  generatorParameters,
  Card,
  RecordLog,
  State,
  Rating,
  Grade,
  createEmptyCard,
} from "ts-fsrs";

export { State, Rating };
export type { Card, RecordLog, Grade };

const defaultParams = generatorParameters({
  enable_fuzz: true,
  enable_short_term: true,
});

export const f = fsrs(defaultParams);

export interface ReviewRatingInput {
  rating: "again" | "hard" | "good" | "easy";
}

export function parseRating(ratingStr: string): Grade {
  const normalized = ratingStr.toLowerCase().trim();
  switch (normalized) {
    case "again":
    case "1":
      return Rating.Again;
    case "hard":
    case "2":
      return Rating.Hard;
    case "good":
    case "3":
      return Rating.Good;
    case "easy":
    case "4":
      return Rating.Easy;
    default:
      return Rating.Good;
  }
}

export function createNewFsrsCard(now = new Date()): Card {
  return createEmptyCard(now);
}

export function scheduleCardReview(card: Card, grade: Grade, reviewDate = new Date()): {
  nextCard: Card;
  log: RecordLog[Grade]["log"];
} {
  const schedulingCards = f.repeat(card, reviewDate);
  const result = schedulingCards[grade];
  return {
    nextCard: result.card,
    log: result.log,
  };
}

export function isCardDue(card: Card, now = new Date()): boolean {
  if (!card.due) return true;
  const dueDate = new Date(card.due);
  return dueDate.getTime() <= now.getTime();
}
