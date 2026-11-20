import { describe, it, expect } from "vitest";
import { FEATURES, PLANS, STUDENT_LADDER, hasExamAccess } from "./plans";

describe("plan matrix", () => {
  it("every paid student plan from the Exam Pass up has the past-question solver", () => {
    for (const id of STUDENT_LADDER.slice(STUDENT_LADDER.indexOf("exam"))) expect(hasExamAccess(id)).toBe(true);
    expect(hasExamAccess("free")).toBe(false);
    expect(hasExamAccess("pro")).toBe(true);
    expect(hasExamAccess("free", "teacher")).toBe(true);
    for (const id of ["teacher", "teacherpro", "school"]) expect(hasExamAccess(id)).toBe(true);
  });

  it("no higher student plan has less access than a lower one", () => {
    for (let i = 1; i < STUDENT_LADDER.length; i++) {
      const lo = STUDENT_LADDER[i - 1];
      const hi = STUDENT_LADDER[i];
      if (hasExamAccess(lo)) expect(hasExamAccess(hi), `${hi} must keep exam access of ${lo}`).toBe(true);
      // the Exam Pass is a cheap exam-only add-on, not a rung below Plus on every limit
      if (lo === "exam") continue;
      for (const f of FEATURES) expect(PLANS[hi].limits[f], `${hi} vs ${lo} ${f}`).toBeGreaterThanOrEqual(PLANS[lo].limits[f]);
      expect(PLANS[hi].monthlyTokens).toBeGreaterThanOrEqual(PLANS[lo].monthlyTokens);
    }
  });
});
