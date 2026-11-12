import { describe, expect, it } from "vitest";
import { readMinutes, splitNote, splitTextbookPages } from "./note-sections";

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

describe("splitTextbookPages", () => {
  it("keeps a section and its sub-sections together on one full page, and gives the quick check its own page", () => {
    const md = [
      "# Photosynthesis",
      "## Light Reactions",
      "Brief intro paragraph.",
      "### Chlorophyll Absorption",
      "Chlorophyll absorbs red and blue photons in thylakoid membranes.",
      "### Electron Transport",
      "Excited electrons flow down the chain to produce ATP.",
      "## Quick Check",
      "1. Where do light reactions occur?\n**Answers:**\n1. Thylakoid membranes.",
    ].join("\n\n");

    const res = splitTextbookPages(md);
    expect(res.title).toBe("Photosynthesis");
    expect(res.pages).toHaveLength(2);
    expect(res.pages[0].title).toBe("Light Reactions");
    expect(res.pages[0].subtopics).toEqual(["Chlorophyll Absorption", "Electron Transport"]);
    expect(res.pages[0].body).toContain("### Electron Transport");
    expect(res.pages[0].body).toContain("Brief intro paragraph.");
    expect(res.pages[1].kind).toBe("check");
  });

  it("runs a long section over at sub-section boundaries into full pages, not tiny ones", () => {
    const para = (n: string) => Array.from({ length: 200 }, (_, i) => `${n}${i}`).join(" ");
    const md = `## Motors\n\nIntro.\n\n### Brushless\n\n${para("a")}\n\n### Coreless\n\n${para("b")}\n\n### Stepper\n\n${para("c")}`;
    const res = splitTextbookPages(md);
    expect(res.pages.length).toBeGreaterThanOrEqual(2);
    expect(res.pages.length).toBeLessThanOrEqual(3);
    for (const p of res.pages) expect(p.body.split(/\s+/).length).toBeGreaterThan(150);
  });

  it("overflows one very long unit cleanly without splitting $$...$$ or code fences", () => {
    const para = Array.from({ length: 300 }, (_, i) => `word${i}`).join(" ");
    const math = "$$\nF = m \\cdot a\n\nE = m c^2\n$$";
    const md = `## Motion\n\n${para}\n\n${para}\n\n${math}`;

    const res = splitTextbookPages(md, { maxWords: 320 });
    expect(res.pages.length).toBeGreaterThanOrEqual(2);
    expect(res.pages.every((p) => p.partTotal === res.pages.length)).toBe(true);
    const mathPage = res.pages.find((p) => p.body.includes("F = m \\cdot a"));
    expect(mathPage?.body).toContain("E = m c^2");
  });

  it("classifies section kinds accurately (short ones that follow join the page before, except checks and examples)", () => {
    const md = [
      "## Overview\nIntro copy.",
      "## Worked example\nStep 1: divide by 2.",
      "## Common mistakes\nDo not drop the negative sign.",
      "## Key terms\n- Velocity: speed with direction.",
      "## Quick check\n1. Why?\n**Answers:** because.",
    ].join("\n\n");

    const res = splitTextbookPages(md);
    expect(res.pages.map((p) => p.kind)).toEqual(["overview", "example", "check"]);
    expect(res.pages[1].body).toContain("Common mistakes");
  });
});
