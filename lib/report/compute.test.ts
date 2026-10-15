import { describe, it, expect } from "vitest";
import { computeReport, usesOnlyKnownNumbers, fallbackNarrative, type EvidenceRow, type ReportInput } from "./compute";

const ev = (p: Partial<EvidenceRow>): EvidenceRow => ({ date: "2026-10-14", activity: "quiz", correct: true, kcId: "k1", pLBefore: 0.2, pLAfter: 0.3, xpEarned: 10, ...p });
const base: ReportInput = { today: "2026-10-15", evidence: [], activityCounts: {}, activityXp: {}, posts: 0, streakDays: 0 };

describe("computeReport", () => {
  it("returns zeros for no data", () => {
    const r = computeReport(base);
    expect(r).toMatchObject({ from: "2026-10-09", to: "2026-10-15", xpGained: 0, quizzesTaken: 0, accuracy: null, studyDays: 0, masteryGain: 0, posts: 0 });
  });
  it("counts only the last 7 days", () => {
    const r = computeReport({ ...base, evidence: [ev({ date: "2026-10-08" }), ev({ date: "2026-10-09" }), ev({ date: "2026-10-15", correct: false })] });
    expect(r.quizzesTaken).toBe(2);
    expect(r.quizCorrect).toBe(1);
    expect(r.accuracy).toBe(50);
  });
  it("computes mastery gain per topic and mastered topics", () => {
    const r = computeReport({
      ...base,
      evidence: [
        ev({ date: "2026-10-10", kcId: "a", pLBefore: 0.5, pLAfter: 0.7 }),
        ev({ date: "2026-10-12", kcId: "a", pLBefore: 0.7, pLAfter: 0.96 }),
        ev({ date: "2026-10-12", kcId: "b", pLBefore: 0.4, pLAfter: 0.3 }),
      ],
    });
    expect(r.masteryGain).toBe(46);
    expect(r.topicsPracticed).toBe(2);
    expect(r.topicsMastered).toBe(1);
  });
  it("merges study days and takes the larger XP source", () => {
    const r = computeReport({
      ...base,
      evidence: [ev({ date: "2026-10-14", xpEarned: 20 }), ev({ date: "2026-10-14", xpEarned: 20, activity: "lab" })],
      activityCounts: { "2026-10-13": 3, "2026-10-01": 9 },
      activityXp: { "2026-10-13": 100, "2026-10-14": 5 },
      streakDays: 4,
      posts: 2,
    });
    expect(r.studyDays).toBe(2);
    expect(r.xpGained).toBe(105);
    expect(r).toMatchObject({ labsPassed: 1, streakDays: 4, posts: 2 });
  });
  it("is defensive about bad numbers", () => {
    const r = computeReport({ ...base, evidence: [ev({ pLAfter: NaN, xpEarned: NaN })], streakDays: NaN });
    expect(Number.isFinite(r.masteryGain)).toBe(true);
    expect(r.xpGained).toBe(0);
    expect(r.streakDays).toBe(0);
  });
});

describe("narrative guard", () => {
  const n = computeReport({ ...base, evidence: [ev({}), ev({})], streakDays: 5 });
  it("accepts text that only uses known numbers", () => {
    expect(usesOnlyKnownNumbers("You answered 2 quizzes and held a 5-day streak.", n)).toBe(true);
    expect(usesOnlyKnownNumbers("Try for 30 minutes a day.", n)).toBe(false);
  });
  it("fallback text passes its own guard", () => {
    for (const r of [n, computeReport(base)]) {
      const f = fallbackNarrative(r);
      expect(usesOnlyKnownNumbers(f.summary + " " + f.suggestion, r)).toBe(true);
    }
  });
});
