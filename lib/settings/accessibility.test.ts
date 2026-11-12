import { describe, it, expect } from "vitest";
import {
  DEFAULT_ACCESSIBILITY,
  parseAccessibility,
  profileTagsFromAccessibility,
} from "./accessibility";

describe("accessibility preferences", () => {
  it("falls back to safe defaults on invalid input", () => {
    expect(parseAccessibility(null)).toEqual(DEFAULT_ACCESSIBILITY);
    expect(parseAccessibility("not-json")).toEqual(DEFAULT_ACCESSIBILITY);
    expect(parseAccessibility(123)).toEqual(DEFAULT_ACCESSIBILITY);
  });

  it("validates fields and ignores unknown values", () => {
    expect(
      parseAccessibility('{"readingFont":"dyslexic","adhdFocus":true,"wideSpacing":"yes","ttsSpeed":1.25}')
    ).toEqual({
      ...DEFAULT_ACCESSIBILITY,
      readingFont: "dyslexic",
      adhdFocus: true,
      wideSpacing: false,
      ttsSpeed: 1.25,
    });
    expect(parseAccessibility({ ttsSpeed: 99 }).ttsSpeed).toBe(1);
  });

  it("maps modes to audience adaptation prompt tags", () => {
    expect(profileTagsFromAccessibility(DEFAULT_ACCESSIBILITY)).toEqual([]);
    expect(
      profileTagsFromAccessibility({
        ...DEFAULT_ACCESSIBILITY,
        adhdFocus: true,
        literalMode: true,
        kidsMode: true,
      })
    ).toEqual(["adhd_friendly", "micro_steps", "literal_mode", "autism_friendly", "kids", "teach_the_bot"]);
  });
});
