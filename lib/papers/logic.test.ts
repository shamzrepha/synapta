import { describe, it, expect } from "vitest";
import {
  sanitizePaper,
  publicQuestions,
  buildResult,
  sanitizeMarks,
  questionsNeedingAi,
  weakTopicReport,
  formatClock,
  totalMarks,
} from "./logic";

const raw = {
  title: "T",
  questions: [
    { type: "mcq" as const, topic: "Forces", prompt: "F=?", options: ["ma", "mv", "m/a", "a/m"], answerIndex: 0, marks: 1 },
    { type: "mcq" as const, topic: "Forces", prompt: "broken", options: ["x"], answerIndex: 0 },
    { type: "mcq" as const, topic: "Forces", prompt: "bad idx", options: ["a", "b"], answerIndex: 5 },
    { type: "short" as const, topic: "Energy", prompt: "Define KE", modelAnswer: "half m v squared", markScheme: "1 for formula", marks: 99 },
  ],
};

describe("sanitizePaper", () => {
  const qs = sanitizePaper(raw, 10);
  it("drops broken questions, re-ids and clamps marks", () => {
    expect(qs.map((q) => q.id)).toEqual(["q1", "q2"]);
    expect(qs[1].marks).toBe(6);
    expect(totalMarks(qs)).toBe(7);
  });
  it("caps the count", () => {
    expect(sanitizePaper(raw, 1)).toHaveLength(1);
  });
  it("public questions hide answers", () => {
    const pub = publicQuestions(qs) as Array<Record<string, unknown>>;
    expect(pub[0]).not.toHaveProperty("answerIndex");
    expect(pub[1]).not.toHaveProperty("modelAnswer");
  });
});

describe("marking", () => {
  const qs = sanitizePaper(raw, 10);
  it("marks mcq deterministically and short answers from the AI, clamped", () => {
    const answers = { q1: "0", q2: "kinetic energy is half m v squared" };
    expect(questionsNeedingAi(qs, answers).map((q) => q.id)).toEqual(["q2"]);
    const ai = sanitizeMarks({ results: [{ id: "q2", awarded: 99, feedback: "Good" }, { id: "nope", awarded: 1 }] }, qs);
    expect(ai.q2.awarded).toBe(6);
    expect(ai.nope).toBeUndefined();
    const r = buildResult(qs, answers, ai);
    expect(r.score).toBe(7);
    expect(r.total).toBe(7);
    expect(r.topics.find((t) => t.topic === "Forces")).toEqual({ topic: "Forces", awarded: 1, max: 1 });
  });
  it("gives zero for blanks, wrong and unmarked answers", () => {
    const r = buildResult(qs, { q1: "2", q2: "" }, {});
    expect(r.score).toBe(0);
    expect(r.perQuestion[0].correctAnswer).toBe("ma");
    expect(r.perQuestion[1].feedback).toBe("No answer given.");
    const r2 = buildResult(qs, { q1: "zzz", q2: "something" }, {});
    expect(r2.perQuestion[0].feedback).toBe("No answer given.");
    expect(r2.perQuestion[1].feedback).toMatch(/couldn't be marked/);
  });
});

describe("weakTopicReport", () => {
  it("merges attempts and sorts weakest first", () => {
    const rep = weakTopicReport([
      { topics: [{ topic: "Forces", awarded: 1, max: 4 }, { topic: "Energy", awarded: 3, max: 3 }] },
      { topics: [{ topic: "forces", awarded: 1, max: 2 }] },
    ]);
    expect(rep[0]).toMatchObject({ topic: "Forces", awarded: 2, max: 6, pct: 33, weak: true });
    expect(rep[1]).toMatchObject({ topic: "Energy", pct: 100, weak: false });
  });
});

describe("formatClock", () => {
  it("formats m:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(605)).toBe("10:05");
    expect(formatClock(-5)).toBe("0:00");
  });
});
