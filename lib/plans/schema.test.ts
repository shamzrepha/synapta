import { describe, it, expect } from "vitest";
import { fitActivityMinutes, normalizeLesson, LessonSchema } from "./schema";

describe("fitActivityMinutes", () => {
  it("rescales to exactly the duration", () => {
    const out = fitActivityMinutes([{ minutes: 10 }, { minutes: 20 }, { minutes: 5 }], 60);
    expect(out.reduce((a, b) => a + b.minutes, 0)).toBe(60);
    expect(out.every((a) => a.minutes >= 1)).toBe(true);
  });
  it("handles junk minutes", () => {
    const out = fitActivityMinutes([{ minutes: NaN }, { minutes: -3 }, { minutes: 0 }], 45);
    expect(out.reduce((a, b) => a + b.minutes, 0)).toBe(45);
  });
  it("handles duration smaller than activity count gracefully", () => {
    const out = fitActivityMinutes([{ minutes: 1 }, { minutes: 1 }, { minutes: 1 }], 2);
    expect(out.every((a) => a.minutes >= 1)).toBe(true);
  });
});

describe("normalizeLesson", () => {
  const base = {
    title: "Fractions",
    objectives: ["Add fractions"],
    activities: [
      { title: "Warm-up", minutes: 7, description: "x" },
      { title: "Practice", minutes: 31, description: "y" },
    ],
    materials: [],
    differentiation: { support: "", extension: "" },
    exitTicket: [{ question: "1/2+1/2?", options: ["1", "2"], answerIndex: 9, explanation: "" }],
  };
  it("clamps answer index and fits time", () => {
    const l = normalizeLesson(LessonSchema.parse(base), 50);
    expect(l.exitTicket[0].answerIndex).toBe(1);
    expect(l.activities.reduce((a, b) => a + b.minutes, 0)).toBe(50);
  });
  it("rejects lessons without objectives", () => {
    expect(LessonSchema.safeParse({ ...base, objectives: [] }).success).toBe(false);
  });
});
