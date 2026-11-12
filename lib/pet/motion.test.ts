import { describe, expect, it } from "vitest";
import { isMonotonic, rappelMs } from "./motion";

describe("rappelMs", () => {
  it("a longer drop takes longer, within sensible limits", () => {
    expect(rappelMs(56)).toBeGreaterThan(rappelMs(10));
    expect(rappelMs(0)).toBeGreaterThanOrEqual(380);
    expect(rappelMs(5000)).toBeLessThanOrEqual(720);
  });
  it("never returns nonsense for bad input", () => {
    expect(rappelMs(Number.NaN)).toBe(380);
    expect(rappelMs(-40)).toBe(380);
  });
});

describe("isMonotonic", () => {
  it("accepts a straight lowering and rejects a hop that rises first or overshoots", () => {
    expect(isMonotonic([338, 340, 352, 372, 390, 394, 394], "down")).toBe(true);
    expect(isMonotonic([338, 330, 321, 377, 395, 396, 394], "down")).toBe(false);
    expect(isMonotonic([338, 372, 396, 394], "down")).toBe(false);
    expect(isMonotonic([338, 372, 396, 394], "down", 3)).toBe(true);
    // on screen "up" means the y value shrinks
    expect(isMonotonic([5, 4, 3], "up")).toBe(true);
    expect(isMonotonic([3, 4, 5], "up")).toBe(false);
  });
});
