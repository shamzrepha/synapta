import { describe, expect, it } from "vitest";
import { afterRetest, afterWrongAnswer, clip, mistakeKey } from "./logic";

describe("mistakeKey", () => {
  it("is stable across case and whitespace and scoped by user", () => {
    expect(mistakeKey("u1", "What is  2+2?")).toBe(mistakeKey("u1", " what is 2+2? "));
    expect(mistakeKey("u1", "a")).not.toBe(mistakeKey("u2", "a"));
    expect(mistakeKey("u1", "a")).not.toBe(mistakeKey("u1", "b"));
  });
});

describe("mistake state", () => {
  it("first wrong answer creates an open entry", () => {
    expect(afterWrongAnswer(null)).toEqual({ wrongCount: 1, retestCorrect: 0, mastered: false });
  });
  it("masters after 2 correct retests in a row", () => {
    let s = afterWrongAnswer(null);
    s = afterRetest(s, true);
    expect(s.mastered).toBe(false);
    s = afterRetest(s, true);
    expect(s.mastered).toBe(true);
  });
  it("a wrong retest resets the run", () => {
    let s = afterRetest(afterWrongAnswer(null), true);
    s = afterRetest(s, false);
    expect(s).toEqual({ wrongCount: 2, retestCorrect: 0, mastered: false });
  });
  it("missing it again reopens a mastered entry", () => {
    const mastered = { wrongCount: 1, retestCorrect: 2, mastered: true };
    expect(afterWrongAnswer(mastered)).toEqual({ wrongCount: 2, retestCorrect: 0, mastered: false });
  });
});

describe("clip", () => {
  it("handles non-strings and long text", () => {
    expect(clip(5, 10)).toBe("");
    expect(clip("  abcdef ", 3)).toBe("abc");
  });
});
