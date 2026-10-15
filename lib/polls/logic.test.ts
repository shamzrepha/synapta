import { describe, it, expect } from "vitest";
import { validatePollOptions, computeResults, isClosed, safeImage } from "./logic";

describe("poll logic", () => {
  it("validates option counts for polls and this-or-that", () => {
    expect(validatePollOptions("poll", [{ text: "a" }]).ok).toBe(false);
    expect(validatePollOptions("poll", [{ text: "a" }, { text: "b" }, { text: " " }]).ok).toBe(true);
    expect(validatePollOptions("poll", Array.from({ length: 7 }, (_, i) => ({ text: "o" + i }))).ok).toBe(false);
    expect(validatePollOptions("thisorthat", [{ text: "a" }, { text: "b" }, { text: "c" }]).ok).toBe(false);
    expect(validatePollOptions("thisorthat", [{ text: "Cats" }, { text: "cats" }]).ok).toBe(false);
  });
  it("percentages add up to 100 and mark the leader", () => {
    const r = computeResults([{ id: "a", votes: 1 }, { id: "b", votes: 1 }, { id: "c", votes: 1 }]);
    expect(r.reduce((s, x) => s + x.percent, 0)).toBe(100);
    const r2 = computeResults([{ id: "a", votes: 3 }, { id: "b", votes: 1 }]);
    expect(r2.map((x) => x.percent)).toEqual([75, 25]);
    expect(r2[0].leading).toBe(true);
    expect(computeResults([{ id: "a", votes: 0 }, { id: "b", votes: 0 }]).every((x) => x.percent === 0 && !x.leading)).toBe(true);
  });
  it("knows when a poll has closed", () => {
    expect(isClosed(null, 100)).toBe(false);
    expect(isClosed(50, 100)).toBe(true);
    expect(isClosed(200, 100)).toBe(false);
  });
  it("only accepts safe image urls", () => {
    expect(safeImage("/uploads/a.png")).toBe("/uploads/a.png");
    expect(safeImage("https://x.com/a.png")).toBe("https://x.com/a.png");
    expect(safeImage("javascript:alert(1)")).toBeNull();
    expect(safeImage("http://x.com/a.png")).toBeNull();
  });
});
