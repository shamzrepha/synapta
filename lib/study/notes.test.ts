import { describe, it, expect } from "vitest";
import { linkCitations, noteTitle, sourcePage, clipSource, refinePrompt } from "./notes";

describe("study notes helpers", () => {
  it("turns page citations into links and leaves real links alone", () => {
    expect(linkCitations("Sides add up [p.3] and more (p. 12).")).toBe("Sides add up [p. 3](#src-3) and more [p. 12](#src-12).");
    expect(linkCitations("see [p.2][p.5]")).toBe("see [p. 2](#src-2)[p. 5](#src-5)");
    expect(linkCitations("[docs](https://x.y)")).toBe("[docs](https://x.y)");
    expect(linkCitations("[p. 4](#src-4)")).toBe("[p. 4](#src-4)");
  });
  it("finds a page of the source", () => {
    const src = "[Page 1]\nalpha\n\n[Page 2]\nbeta\nmore\n\n[Page 3]\ngamma";
    expect(sourcePage(src, 2)).toBe("beta\nmore");
    expect(sourcePage(src, 9)).toBe("");
    expect(sourcePage("no markers", 1)).toBe("");
  });
  it("takes the title from the first heading", () => {
    expect(noteTitle("# **Right** triangles\n\ntext")).toBe("Right triangles");
    expect(noteTitle("no heading")).toBe("Study notes");
  });
  it("clips very long sources and says so", () => {
    expect(clipSource("a".repeat(50), 10)).toContain("cut to fit");
    expect(clipSource("short", 10)).toBe("short");
  });
  it("puts the instruction first in a refine request", () => {
    expect(refinePrompt("# N", "src", "make it simpler").startsWith("Instruction: make it simpler")).toBe(true);
  });
});
