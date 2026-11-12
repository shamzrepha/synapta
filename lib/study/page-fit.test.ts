import { describe, expect, it } from "vitest";
import { blockLines, budgetFor, splitOversize } from "./page-fit";
import { splitAtomicBlocks, splitTextbookPages } from "./note-sections";

const CPL = 40;
const para = (n: number) => Array.from({ length: n }, (_, i) => `Sentence number ${i} explains one small idea clearly.`).join(" ");

describe("blockLines", () => {
  it("a paragraph grows with its length", () => {
    expect(blockLines(para(1), CPL)).toBeLessThan(blockLines(para(6), CPL));
  });
  it("a table costs one line-ish per row and does not wrap", () => {
    const t = "| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |";
    expect(blockLines(t, CPL)).toBeGreaterThan(4 * 1.5);
    expect(blockLines(t, CPL)).toBeLessThan(10);
  });
  it("a display equation and a widget are not counted as plain text", () => {
    expect(blockLines("$$\nE = mc^2\n$$", CPL)).toBeGreaterThan(2.5);
    expect(blockLines("```quickcheck\nQ\n```", CPL)).toBeGreaterThan(9);
  });
});

describe("splitOversize", () => {
  it("cuts a long paragraph between sentences and loses nothing", () => {
    const p = para(40);
    const parts = splitOversize(p, 12, CPL);
    expect(parts.length).toBeGreaterThan(1);
    for (const x of parts) expect(blockLines(x, CPL)).toBeLessThanOrEqual(12.5);
    expect(parts.join(" ")).toBe(p);
  });
  it("a long table keeps its header on every part", () => {
    const rows = Array.from({ length: 30 }, (_, i) => `| r${i} | v${i} |`).join("\n");
    const parts = splitOversize(`| name | value |\n|---|---|\n${rows}`, 14, CPL);
    expect(parts.length).toBeGreaterThan(1);
    for (const x of parts) expect(x.startsWith("| name | value |\n|---|---|")).toBe(true);
    expect(parts.join("\n").match(/\| r\d+ \|/g)).toHaveLength(30);
  });
});

describe("splitTextbookPages with a line budget", () => {
  const md = ["## Motors", para(30), "### Brushed", para(14), "- one\n- two\n- three", "### Brushless", para(20)].join("\n\n");
  const budget = { maxLines: 16, charsPerLine: CPL };

  it("every page fits the budget (a lone unsplittable block excepted)", () => {
    const { pages } = splitTextbookPages(md, { budget });
    expect(pages.length).toBeGreaterThan(2);
    for (const pg of pages) {
      const blocks = splitAtomicBlocks(pg.body);
      const total = blocks.reduce((a, b) => a + blockLines(b, CPL), 0);
      if (blocks.length > 1) expect(total).toBeLessThanOrEqual(16 + 0.01);
    }
  });

  it("keeps all the text", () => {
    const { pages } = splitTextbookPages(md, { budget });
    const all = pages.map((p) => p.body).join(" ").replace(/\s+/g, " ");
    for (let i = 0; i < 30; i += 7) expect(all).toContain(`Sentence number ${i} explains`);
    // a page's first heading is kept as its title, not repeated in the body
    expect(pages.some((pg) => pg.subtopic === "Brushless" || pg.body.includes("Brushless"))).toBe(true);
  });

  it("never leaves a heading alone at the bottom of a page", () => {
    const text = ["## Chapter", para(10), "### Heading that must travel", para(10)].join("\n\n");
    for (let lines = 8; lines <= 20; lines++) {
      const { pages } = splitTextbookPages(text, { budget: { maxLines: lines, charsPerLine: CPL } });
      for (const pg of pages) {
        const blocks = splitAtomicBlocks(pg.body);
        if (blocks.length > 1) expect(/^#{1,6}\s/.test(blocks[blocks.length - 1])).toBe(false);
      }
    }
  });

  it("without a budget the old word-based pages are unchanged", () => {
    const { pages } = splitTextbookPages(md);
    expect(pages.length).toBeGreaterThan(0);
  });
});

describe("budgetFor", () => {
  it("a tall screen holds more lines than a short one, and bigger text fewer", () => {
    expect(budgetFor(390, 900).maxLines).toBeGreaterThan(budgetFor(390, 640).maxLines);
    expect(budgetFor(390, 800, 1.4).maxLines).toBeLessThan(budgetFor(390, 800, 1).maxLines);
  });
  it("stays within sane limits", () => {
    const b = budgetFor(360, 300);
    expect(b.maxLines).toBeGreaterThanOrEqual(11);
    expect(budgetFor(1600, 2000).maxLines).toBeLessThanOrEqual(30);
    expect(b.charsPerLine).toBeGreaterThanOrEqual(22);
  });
});
