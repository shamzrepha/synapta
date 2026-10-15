import { describe, expect, it } from "vitest";
import { cleanQuestions, completeToday, currentStreak, dailyXp } from "./logic";

describe("daily streak", () => {
  it("starts at 1, extends on consecutive days, resets after a gap", () => {
    let s = completeToday(null, "2026-10-10");
    expect(s).toEqual({ streak: 1, best: 1, last: "2026-10-10" });
    s = completeToday(s, "2026-10-11");
    expect(s.streak).toBe(2);
    s = completeToday(s, "2026-10-13");
    expect(s).toEqual({ streak: 1, best: 2, last: "2026-10-13" });
  });
  it("is idempotent within a day", () => {
    const s = completeToday(null, "2026-10-10");
    expect(completeToday(s, "2026-10-10")).toBe(s);
  });
  it("shows 0 once a day has been missed", () => {
    const s = { streak: 5, best: 5, last: "2026-10-10" };
    expect(currentStreak(s, "2026-10-10")).toBe(5);
    expect(currentStreak(s, "2026-10-11")).toBe(5);
    expect(currentStreak(s, "2026-10-12")).toBe(0);
    expect(currentStreak(null, "2026-10-12")).toBe(0);
  });
});

describe("dailyXp", () => {
  it("rewards correct answers and a perfect score", () => {
    expect(dailyXp(0, 5)).toBe(10);
    expect(dailyXp(3, 5)).toBe(22);
    expect(dailyXp(5, 5)).toBe(40);
  });
});

describe("cleanQuestions", () => {
  const good = { src: 1, question: "Q1?", options: ["a", "b", "c", "d"], correctIndex: 2, explanation: "because" };
  it("keeps valid questions and clamps src", () => {
    const out = cleanQuestions([{ ...good, src: 99 }], 3);
    expect(out).toHaveLength(1);
    expect(out[0].src).toBe(2);
  });
  it("drops malformed, duplicate-option and duplicate questions", () => {
    const out = cleanQuestions(
      [
        good,
        { ...good },
        { ...good, question: "Q2?", options: ["a", "a", "c", "d"] },
        { ...good, question: "Q3?", options: ["a", "b", "c"] },
        { ...good, question: "Q4?", correctIndex: 7 },
        { ...good, question: "", },
        { ...good, question: "Q5?", options: ["a", "b", "", "d"] },
      ],
      2
    );
    expect(out).toHaveLength(1);
  });
});
