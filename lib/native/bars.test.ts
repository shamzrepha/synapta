import { describe, it, expect } from "vitest";
import { isLightHex, rgbToHex } from "./bars";

describe("native bars colour", () => {
  it("reads css colours and ignores transparent ones", () => {
    expect(rgbToHex("rgb(11, 14, 26)")).toBe("#0b0e1a");
    expect(rgbToHex("rgba(246, 247, 251, 1)")).toBe("#f6f7fb");
    expect(rgbToHex("rgba(0, 0, 0, 0)")).toBeNull();
    expect(rgbToHex("oklch(0.2 0 0)")).toBeNull();
  });
  it("tells light surfaces from dark ones", () => {
    expect(isLightHex("#f6f7fb")).toBe(true);
    expect(isLightHex("#ffffff")).toBe(true);
    expect(isLightHex("#0b0e1a")).toBe(false);
    expect(isLightHex("#3552e0")).toBe(false);
  });
});
