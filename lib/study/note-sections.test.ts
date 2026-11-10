import { describe, expect, it } from "vitest";
import { readMinutes, splitNote } from "./note-sections";

describe("splitNote", () => {
  it("uses a lone top heading as the title and ## headings as pages", () => {
    const r = splitNote("# LEDs\nIntro text\n\n## What is an LED\nA diode.\n\n## Wiring\nUse a resistor.");
    expect(r.title).toBe("LEDs");
    expect(r.pages.map((p) => p.title)).toEqual(["Overview", "What is an LED", "Wiring"]);
  });
  it("ignores # lines inside code fences", () => {
    const r = splitNote("## Code\n```\n# not a heading\nx=1\n```\nafter");
    expect(r.pages).toHaveLength(1);
    expect(r.pages[0].body).toContain("# not a heading");
  });
  it("keeps plain text as one page", () => {
    const r = splitNote("Just a paragraph.");
    expect(r.pages).toHaveLength(1);
    expect(r.pages[0].body).toBe("Just a paragraph.");
  });
  it("estimates reading time", () => {
    expect(readMinutes("word ".repeat(450))).toBe(2);
    expect(readMinutes("")).toBe(1);
  });
});
