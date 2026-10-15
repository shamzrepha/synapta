import { describe, it, expect } from "vitest";
import { DEFAULT_PREFS, parsePrefs, shouldAutoplay, shouldDeferHeavy } from "./prefs";

describe("prefs", () => {
  it("falls back to defaults on junk", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("{bad")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs(42)).toEqual(DEFAULT_PREFS);
  });
  it("parses strings and objects, coercing to booleans", () => {
    expect(parsePrefs('{"dataSaver":true,"reduceMotion":"yes"}')).toEqual({ dataSaver: true, reduceMotion: false, noAutoplay: false });
    expect(parsePrefs({ noAutoplay: true }).noAutoplay).toBe(true);
  });
  it("data saver disables autoplay and defers heavy content", () => {
    expect(shouldAutoplay(DEFAULT_PREFS)).toBe(true);
    expect(shouldAutoplay({ ...DEFAULT_PREFS, dataSaver: true })).toBe(false);
    expect(shouldAutoplay({ ...DEFAULT_PREFS, noAutoplay: true })).toBe(false);
    expect(shouldDeferHeavy({ ...DEFAULT_PREFS, dataSaver: true })).toBe(true);
    expect(shouldDeferHeavy(DEFAULT_PREFS)).toBe(false);
  });
});
