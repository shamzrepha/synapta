import { describe, it, expect } from "vitest";
import {
  createNewFsrsCard,
  scheduleCardReview,
  parseRating,
  isCardDue,
  Rating,
  State,
} from "./scheduler";

describe("lib/fsrs/scheduler", () => {
  it("initializes a brand new card in State.New", () => {
    const card = createNewFsrsCard();
    expect(card.state).toBe(State.New);
    expect(card.reps).toBe(0);
    expect(isCardDue(card)).toBe(true);
  });

  it("advances card state upon review ratings", () => {
    const card = createNewFsrsCard();
    const goodGrade = parseRating("good");
    expect(goodGrade).toBe(Rating.Good);

    const { nextCard, log } = scheduleCardReview(card, goodGrade);
    expect(nextCard.reps).toBeGreaterThan(0);
    expect(log.rating).toBe(Rating.Good);
    expect(nextCard.due.getTime()).toBeGreaterThan(Date.now());
  });

  it("correctly identifies due and non-due cards", () => {
    const pastCard = {
      ...createNewFsrsCard(),
      due: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
    };
    expect(isCardDue(pastCard)).toBe(true);

    const futureCard = {
      ...createNewFsrsCard(),
      due: new Date(Date.now() + 1000 * 60 * 60 * 24), // tomorrow
    };
    expect(isCardDue(futureCard)).toBe(false);
  });
});
