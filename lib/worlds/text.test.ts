import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { cleanLines, textToRawLines } from "./clean";
import { buildOutline, templateHint, isHeading } from "./outline";
import { fuzzyContains, jaccard, wordCount } from "./fuzzy";

const read = (f: string) => fs.readFileSync(`fixtures/worlds/${f}`, "utf8");

describe("fuzzy matching", () => {
  it("accepts verbatim and lightly reformatted excerpts, rejects invented ones", () => {
    const src = "Pinch the proximal end of the gastrostomy tube (to prevent air from entering)";
    expect(fuzzyContains(src, "pinch the proximal end of the gastrostomy tube to prevent air from entering")).toBe(true);
    expect(fuzzyContains(src, "Tilt the head back and open the valve")).toBe(false);
    expect(jaccard("the tube stays", "the tube stays")).toBe(1);
    expect(wordCount("one two  three")).toBe(3);
  });
});

describe("cleaning the dyspnoea fixture", () => {
  const { lines, repairs } = cleanLines(textToRawLines(read("dyspnoea_sample.txt")));
  it("removes chat boilerplate, citation tags and duplicate paragraphs, and logs each", () => {
    const text = lines.map((l) => l.text).join("\n");
    expect(text).not.toMatch(/In the next part/i);
    expect(lines.some((l) => l.text === "CDC")).toBe(false);
    expect(text.match(/Isoniazid is an anti-TB drug/g)).toHaveLength(1);
    const kinds = repairs.map((r) => r.kind);
    expect(kinds).toContain("boilerplate_removed");
    expect(kinds).toContain("duplicate_removed");
  });
  it("repairs the (R) and (E) symbols but flags them for the student instead of fixing silently", () => {
    const r = lines.find((l) => l.text.startsWith("Rifampicin"))!;
    const e = lines.find((l) => l.text.startsWith("Ethambutol"))!;
    expect(r.text).toBe("Rifampicin (R)");
    expect(e.text).toBe("Ethambutol (E)");
    expect(r.flagged && e.flagged).toBe(true);
    expect(repairs.filter((x) => x.kind === "symbol_repaired")).toHaveLength(2);
  });
});

describe("outline", () => {
  it("recognises the condition template from repeated headings", () => {
    const { lines } = cleanLines(textToRawLines(read("dyspnoea_sample.txt")));
    const out = buildOutline(lines);
    expect(out.map((s) => s.title)).toEqual(expect.arrayContaining(["DYSPNOEA", "CAUSES", "PATHOPHYSIOLOGY"]));
    // ranges cover the document with no gaps or overlaps
    for (let i = 1; i < out.length; i++) expect(out[i].lineStart).toBe(out[i - 1].lineEnd + 1);
    expect(out[0].lineStart).toBe(1);
    expect(out[out.length - 1].lineEnd).toBe(lines.length);
  });
  it("recognises a procedure note and finds numbered steps", () => {
    const { lines } = cleanLines(textToRawLines(read("gastrostomy_sample.txt")));
    const out = buildOutline(lines);
    expect(out.some((s) => s.kindHint === "procedure")).toBe(true);
    expect(isHeading("COMPLICATIONS")?.title).toBe("COMPLICATIONS");
    expect(isHeading("Pinch the tube.")).toBeNull();
    expect(templateHint(out)).toBeDefined();
  });
  it("flags low-confidence handwriting for the student to confirm and never guesses", () => {
    const { lines } = cleanLines([{ text: "Peristomal infection is the most common complication (5-6?% cases)", confidence: 0.6 }, { text: "Keep the site dry.", confidence: 0.95 }]);
    expect(lines[0].flagged).toBe(true);
    expect(lines[0].flagReason).toBeTruthy();
    expect(lines[1].flagged).toBeUndefined();
  });
});
