import { describe, expect, it } from "vitest";
import { classEncouragement } from "./encourage";

const base = { topics: 10, mastered: 0, started: 0, streakDays: 0, avg: null as number | null };

describe("classEncouragement", () => {
  it("welcomes a brand-new learner without judging", () => {
    expect(classEncouragement(base)).toMatch(/Fresh start/);
  });
  it("praises strong mastery with the real numbers", () => {
    expect(classEncouragement({ ...base, avg: 0.9, mastered: 8, started: 10 })).toContain("8 of 10");
  });
  it("is gentle when the learner is struggling", () => {
    const t = classEncouragement({ ...base, avg: 0.15, started: 2 });
    expect(t).toMatch(/small topic/);
    expect(t).not.toMatch(/wow/i);
  });
  it("offers to continue where they left off", () => {
    expect(classEncouragement({ ...base, avg: 0.45, started: 3, leftOff: "Brushless motors" })).toContain("Brushless motors");
  });
  it("mentions a streak of three days or more", () => {
    expect(classEncouragement({ ...base, avg: 0.7, mastered: 4, started: 6, streakDays: 5 })).toContain("5-day streak");
    expect(classEncouragement({ ...base, avg: 0.7, mastered: 4, started: 6, streakDays: 2 })).not.toContain("streak");
  });
  it("copes with an empty class and stays short", () => {
    expect(classEncouragement({ ...base, topics: 0 })).toMatch(/no topics/);
    expect(classEncouragement({ ...base, avg: 0.5, started: 3, leftOff: "x".repeat(200), streakDays: 9 }).length).toBeLessThanOrEqual(180);
  });
});
