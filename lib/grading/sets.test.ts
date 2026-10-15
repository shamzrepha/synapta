import { describe, it, expect } from "vitest";
import { buildQuestions, studentQuestion, SetInput } from "./sets";

describe("buildQuestions", () => {
  const qs = buildQuestions([
    { prompt: "Why?", modelAnswer: "Because", rubric: [{ criterion: "a", marks: 1.2 }, { criterion: "b", marks: 2 }] },
    { prompt: "How?", modelAnswer: "Like so", rubric: [{ criterion: "c", marks: 3 }] },
  ]);
  it("assigns ids and totals", () => {
    expect(qs[0].id).toBe("q1");
    expect(qs[0].rubric.map((r) => r.id)).toEqual(["q1c1", "q1c2"]);
    expect(qs[0].maxMarks).toBe(3);
    expect(qs[1].maxMarks).toBe(3);
  });
  it("hides model answer and rubric text from students", () => {
    const s = studentQuestion(qs[0]);
    expect(JSON.stringify(s)).not.toContain("Because");
    expect(s).toEqual({ id: "q1", prompt: "Why?", maxMarks: 3 });
  });
});

describe("SetInput", () => {
  it("requires at least one question with a rubric", () => {
    expect(SetInput.safeParse({ classId: "c", title: "t", questions: [] }).success).toBe(false);
    expect(
      SetInput.safeParse({ classId: "c", title: "t", questions: [{ prompt: "p", modelAnswer: "m", rubric: [] }] }).success
    ).toBe(false);
  });
});
