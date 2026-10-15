import { describe, it, expect } from "vitest";
import { validRating, xpForRating, xpEligible, tutorScore, averageRating, canRequestTutor, subjectsOverlap } from "./rules";

describe("tutor rules", () => {
  it("accepts only whole ratings 1-5", () => {
    expect(validRating(5)).toBe(true);
    expect(validRating(0)).toBe(false);
    expect(validRating(3.5)).toBe(false);
    expect(validRating("5")).toBe(false);
  });
  it("pays more XP for better ratings", () => {
    expect(xpForRating(5)).toBeGreaterThan(xpForRating(3));
    expect(xpForRating(1)).toBeLessThan(xpForRating(3));
    expect(xpForRating(9)).toBe(0);
  });
  it("caps XP per day and per pair", () => {
    expect(xpEligible(0, 0)).toBe(true);
    expect(xpEligible(5, 0)).toBe(false);
    expect(xpEligible(1, 2)).toBe(false);
  });
  it("ranks many good ratings above one perfect rating", () => {
    expect(tutorScore(200, 40)).toBeGreaterThan(tutorScore(5, 1));
    expect(averageRating(9, 2)).toBe(4.5);
    expect(averageRating(0, 0)).toBeNull();
  });
  it("blocks self tutoring and matches subjects loosely", () => {
    expect(canRequestTutor("a", "a")).toBe(false);
    expect(canRequestTutor("a", "b")).toBe(true);
    expect(canRequestTutor("a", null)).toBe(true);
    expect(subjectsOverlap(["physics", "maths"], "Physics")).toBe(true);
    expect(subjectsOverlap(["physics"], "chemistry")).toBe(false);
  });
});
