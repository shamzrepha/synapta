import { describe, expect, it } from "vitest";
import { assertPublished, draftMap, isPublished, publishMapOf } from "./published";

describe("teacher-first publishing", () => {
  it("treats topics from before the feature as published", () => {
    expect(publishMapOf({})).toEqual({ lesson: true, audio: true, simulation: true, practice: true });
    expect(isPublished(undefined, "lesson")).toBe(true);
  });

  it("starts new topics as drafts", () => {
    const kc = { contentPublished: draftMap() };
    expect(isPublished(kc, "audio")).toBe(false);
    expect(() => assertPublished(false, kc, "audio")).toThrow(/hasn't published/);
  });

  it("lets teachers through and respects each piece separately", () => {
    const kc = { contentPublished: { lesson: true, audio: false, simulation: false, practice: true } };
    expect(() => assertPublished(true, kc, "audio")).not.toThrow();
    expect(() => assertPublished(false, kc, "lesson")).not.toThrow();
    expect(() => assertPublished(false, kc, "simulation")).toThrow();
    expect(isPublished({ contentPublished: { lesson: "yes" } }, "lesson")).toBe(false);
  });
});
