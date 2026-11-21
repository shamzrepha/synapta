import { describe, it, expect } from "vitest";
import {
  QUALIFY_THRESHOLD,
  LEARNING_KINDS,
  LEARNING_WEIGHTS,
  addLearning,
  dayPoints,
  dayProgress,
  kindPoints,
  progressMessage,
  qualifies,
  shouldCountReader,
  streakAnchorDate,
} from "./qualify";

describe("streak qualification", () => {
  it("logging in, presence and notifications are worth nothing", () => {
    for (const kind of ["login", "presence", "app_open", "notification", "device", "bootstrap"]) {
      expect(kindPoints(kind, 500)).toBe(0);
      expect(addLearning({}, kind, 500)).toEqual({});
    }
    expect(qualifies({})).toBe(false);
    expect(qualifies(null)).toBe(false);
  });

  it("ten quiz answers qualify a day, nine do not", () => {
    let c = {};
    for (let i = 0; i < 9; i++) c = addLearning(c, "quiz");
    expect(dayPoints(c)).toBe(27);
    expect(qualifies(c)).toBe(false);
    c = addLearning(c, "quiz");
    expect(qualifies(c)).toBe(true);
  });

  it("spamming one action cannot exceed its cap, and only quizzes and labs can qualify a day alone", () => {
    for (const kind of LEARNING_KINDS) {
      const spam = addLearning({}, kind, 10_000);
      expect(dayPoints(spam)).toBeLessThanOrEqual(LEARNING_WEIGHTS[kind].cap);
      expect(qualifies(spam)).toBe(["quiz", "lab"].includes(kind));
    }
    // flashcards alone never qualify; adding two written answers does
    let c = addLearning({}, "flashcard", 1000);
    expect(qualifies(c)).toBe(false);
    c = addLearning(c, "theory", 2);
    expect(qualifies(c)).toBe(true);
  });

  it("a stored count above the cap still scores only the cap", () => {
    expect(kindPoints("reader", 999)).toBe(LEARNING_WEIGHTS.reader.cap);
    expect(dayPoints({ reader: 999 })).toBe(24);
  });

  it("reports progress and caps the display at the threshold", () => {
    const p = dayProgress({ quiz: 4, flashcard: 1 });
    expect(p).toEqual({ points: 14, threshold: QUALIFY_THRESHOLD, remaining: 16, qualified: false });
    expect(progressMessage(p)).toContain("14/30 points");
    expect(progressMessage(p)).toContain("6 more quiz questions");
    expect(dayProgress({}, true).qualified).toBe(true);
    expect(progressMessage(dayProgress({ quiz: 10 }))).toContain("30/30");
  });

  it("throttles reader signals", () => {
    expect(shouldCountReader(null, 1000)).toBe(true);
    expect(shouldCountReader(1000, 5000)).toBe(false);
    expect(shouldCountReader(1000, 16_000)).toBe(true);
  });

  it("keeps legacy streaks: lastQualifiedDate wins once present, otherwise lastActiveDate", () => {
    expect(streakAnchorDate({ lastActiveDate: "2026-11-20" })).toBe("2026-11-20");
    expect(streakAnchorDate({ lastActiveDate: "2026-11-21", lastQualifiedDate: "2026-11-19" })).toBe("2026-11-19");
    expect(streakAnchorDate({})).toBeNull();
  });
});
