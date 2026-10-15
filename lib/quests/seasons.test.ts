import { describe, it, expect } from "vitest";
import { SEASONS, seasonStatus, activeSeasons, applySeasonDelta, taskProgress, seasonComplete, daysLeft } from "./seasons";

const exam = SEASONS.find((s) => s.id === "exam-season-2026")!;

describe("season config", () => {
  it("is well formed", () => {
    expect(new Set(SEASONS.map((s) => s.id)).size).toBe(SEASONS.length);
    expect(new Set(SEASONS.map((s) => s.badge.id)).size).toBe(SEASONS.length);
    for (const s of SEASONS) {
      expect(s.start <= s.end).toBe(true);
      expect(s.tasks.length).toBeGreaterThanOrEqual(3);
      expect(s.rewardXp).toBeGreaterThan(0);
      for (const t of s.tasks) expect(t.target).toBeGreaterThan(0);
    }
  });
  it("seasons do not overlap", () => {
    const sorted = [...SEASONS].sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].start > sorted[i - 1].end).toBe(true);
  });
});

describe("status", () => {
  it("is inclusive of start and end", () => {
    expect(seasonStatus(exam, "2026-09-30")).toBe("upcoming");
    expect(seasonStatus(exam, "2026-10-01")).toBe("active");
    expect(seasonStatus(exam, "2026-11-15")).toBe("active");
    expect(seasonStatus(exam, "2026-11-16")).toBe("ended");
    expect(activeSeasons("2026-10-15").map((s) => s.id)).toEqual(["exam-season-2026"]);
  });
  it("counts days left", () => {
    expect(daysLeft(exam, "2026-11-15")).toBe(1);
    expect(daysLeft(exam, "2026-11-20")).toBe(0);
  });
});

describe("progress", () => {
  it("ignores events outside the window", () => {
    expect(applySeasonDelta(exam, {}, { quizCorrect: 5 }, "2026-09-20")).toBeNull();
    expect(applySeasonDelta(exam, {}, { quizCorrect: 5 }, "2026-12-01")).toBeNull();
  });
  it("accumulates and caps at the target", () => {
    const a = applySeasonDelta(exam, {}, { quizCorrect: 60, xp: 50 }, "2026-10-15")!;
    expect(a).toEqual({ quizCorrect: 60, xp: 50 });
    const b = applySeasonDelta(exam, a, { quizCorrect: 60 }, "2026-10-16")!;
    expect(b.quizCorrect).toBe(100);
    expect(applySeasonDelta(exam, b, { quizCorrect: 5 }, "2026-10-17")).toBeNull();
    expect(applySeasonDelta(exam, {}, { posts: 3 }, "2026-10-15")).toBeNull();
  });
  it("detects completion", () => {
    expect(seasonComplete(exam, { quizCorrect: 100, flashcards: 100, masteries: 2 })).toBe(false);
    expect(seasonComplete(exam, { quizCorrect: 100, flashcards: 100, masteries: 2, xp: 1000 })).toBe(true);
    expect(taskProgress(exam, { quizCorrect: 999 })[0]).toMatchObject({ value: 100, done: true });
  });
});
