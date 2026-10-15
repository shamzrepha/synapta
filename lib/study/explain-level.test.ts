import { describe, it, expect } from "vitest";
import { parseExplainLevel, levelInstruction } from "./explain-level";

describe("explain level", () => {
  it("parses unknown values to standard", () => {
    expect(parseExplainLevel("simple")).toBe("simple");
    expect(parseExplainLevel("lecturer")).toBe("lecturer");
    expect(parseExplainLevel("nonsense")).toBe("standard");
    expect(parseExplainLevel(null)).toBe("standard");
  });
  it("only adds instructions for non-standard levels", () => {
    expect(levelInstruction("standard")).toBe("");
    expect(levelInstruction(undefined)).toBe("");
    expect(levelInstruction("simple")).toContain("12-year-old");
    expect(levelInstruction("lecturer")).toContain("LECTURER");
  });
});
