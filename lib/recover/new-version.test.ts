import { describe, expect, it } from "vitest";
import { isNewBuild, shouldApplyNow } from "./new-version";

describe("new deployment detection", () => {
  it("is new only when both ids are known and different", () => {
    expect(isNewBuild("abc", "def")).toBe(true);
    expect(isNewBuild("abc", "abc")).toBe(false);
    expect(isNewBuild("abc", "")).toBe(false);
    expect(isNewBuild(undefined, "def")).toBe(false);
    expect(isNewBuild(null, null)).toBe(false);
  });
  it("never nags in local development", () => {
    expect(isNewBuild("dev", "def")).toBe(false);
    expect(isNewBuild("abc", "dev")).toBe(false);
  });
  it("refreshes by itself only when changing page and not while typing", () => {
    expect(shouldApplyNow({ pending: true, navigated: true, typing: false })).toBe(true);
    expect(shouldApplyNow({ pending: true, navigated: true, typing: true })).toBe(false);
    expect(shouldApplyNow({ pending: true, navigated: false, typing: false })).toBe(false);
    expect(shouldApplyNow({ pending: false, navigated: true, typing: false })).toBe(false);
  });
});
