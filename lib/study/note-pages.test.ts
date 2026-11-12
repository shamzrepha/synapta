import { describe, it, expect } from "vitest";
import { paginateNoteMarkdown, markdownToSpeechText } from "./note-pages";

describe("note-pages flipbook pagination", () => {
  it("splits multi-section markdown into ordered flipbook pages without breaking code or math", () => {
    const md = `# Fractions & Ratios

## Big Picture
Fractions let us share equal slices fairly.

## Simplifying 2/4
Watch how $2/4 = 1/2$ works step by step:

$$
2x + 4 = 10 \\\\
x = 3
$$

## Summary
- Divide top and bottom by the same greatest factor.`;

    const pages = paginateNoteMarkdown(md, "Fractions");
    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(pages[0].title).toBe("Big Picture");
    expect(pages[1].title).toContain("Simplifying");
    expect(pages[1].scenes.some((s) => s.kind === "fraction_slash")).toBe(true);
    expect(pages[pages.length - 1].kind).toBe("summary");
  });

  it("never splits inside fenced sunroot-motion or code blocks", () => {
    const md = `# Motion Example

Intro text here with plenty of words so pagination activates properly.

\`\`\`sunroot-motion
{
  "kind": "fraction_slash",
  "num": 6,
  "den": 8
}
\`\`\`

End of page.`;
    const pages = paginateNoteMarkdown(md);
    expect(pages).toHaveLength(1);
    expect(pages[0].scenes[0]).toMatchObject({ kind: "fraction_slash", num: 6, den: 8 });
    expect(pages[0].markdown).not.toContain("sunroot-motion");
  });

  it("strips markdown & LaTeX symbols for crisp speech synthesis", () => {
    const spoken = markdownToSpeechText("## Hello *world*! Look at $\\frac{2}{4}$ [1](#src-1).");
    expect(spoken).toBe("Hello world! Look at 2 over 4 1.");
  });
});
