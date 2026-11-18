import { describe, it, expect } from "vitest";
import { normalizeGrade } from "./grade";

const base = { transcribedSteps: [], stepFeedback: [], missingFormulasOrUnits: [], examinerAdvice: "ok" };

describe("normalizeGrade", () => {
  it("clamps the mark to the question's marks and derives percent and verdict", () => {
    expect(normalizeGrade({ ...base, scoreAwarded: 120 }, 15)).toMatchObject({ scoreAwarded: 15, scorePercent: 100, verdict: "excellent" });
    expect(normalizeGrade({ ...base, scoreAwarded: -3 }, 15)).toMatchObject({ scoreAwarded: 0, scorePercent: 0, verdict: "needs_work" });
    expect(normalizeGrade({ ...base, scoreAwarded: 7.3 }, 15)).toMatchObject({ scoreAwarded: 7.5, scorePercent: 50, verdict: "partial" });
  });
  it("treats NaN as zero", () => {
    expect(normalizeGrade({ ...base, scoreAwarded: Number.NaN }, 10).scoreAwarded).toBe(0);
  });
});
