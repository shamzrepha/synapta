import { describe, it, expect } from "vitest";
import { alnum, plainBlock, textHasBlock, pageHolding } from "./find-block";

describe("finding a paragraph", () => {
  it("compares only the words, whatever the markdown", () => {
    expect(alnum("**Clinicians** must, therefore…")).toBe("cliniciansmusttherefore");
    expect(plainBlock("See [the scale](https://x.y/z) and **bold** text")).toBe("See the scale and **bold** text");
  });
  it("matches a paragraph to the text drawn for it, links and emphasis included", () => {
    const md = "Clinicians must therefore **dissect** the [qualitative](https://a.b) aspects of the symptom.";
    expect(textHasBlock("Clinicians must therefore dissect the qualitative aspects of the symptom.", md)).toBe(true);
    expect(textHasBlock("Definition. Dyspnoea is a subjective perception.", md)).toBe(false);
  });
  it("finds the page that holds a paragraph, even when the page is longer", () => {
    const pages = ["# 1.1 Overview\n\nClinicians must therefore dissect the aspects.", "## Other\n\nSomething else entirely."];
    expect(pageHolding(pages, "Clinicians must therefore dissect")).toBe(0);
    expect(pageHolding(pages, "Something else entirely.")).toBe(1);
    expect(pageHolding(pages, "Nowhere to be found in these pages")).toBe(-1);
  });
});
