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
  it("dives into ## chapters and ### subtopics while folding short intro blurbs", () => {
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
    expect(res.pages.map((p) => p.subtopic)).toEqual([
      "Chlorophyll Absorption",
      "Electron Transport",
      null,
    ]);
    expect(res.pages[0].title).toBe("Light Reactions");
    expect(res.pages[0].body).toContain("Brief intro paragraph.");
    expect(res.pages[2].kind).toBe("check");
  });

  it("overflows long sections cleanly without splitting $$...$$ or code fences", () => {
    const para = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const math = "$$\nF = m \\cdot a\n\nE = m c^2\n$$";
    const md = `## Motion\n\n${para}\n\n${para}\n\n${math}`;

    const res = splitTextbookPages(md, { maxWords: 120 });
    expect(res.pages.length).toBeGreaterThanOrEqual(2);
    expect(res.pages.every((p) => p.partTotal === res.pages.length)).toBe(true);
    const mathPage = res.pages.find((p) => p.body.includes("F = m \\cdot a"));
    expect(mathPage?.body).toContain("E = m c^2");
  });

  it("classifies section kinds accurately", () => {
    const md = [
      "## Overview\nIntro copy.",
      "## Worked example\nStep 1: divide by 2.",
      "## Common mistakes\nDo not drop the negative sign.",
      "## Key terms\n- Velocity: speed with direction.",
    ].join("\n\n");

    const res = splitTextbookPages(md);
    expect(res.pages.map((p) => p.kind)).toEqual(["overview", "example", "mistakes", "terms"]);
  });
});
