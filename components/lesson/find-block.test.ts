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
  it("never sends a repeated title back to the first page", () => {
    const pages = ["# Circuits\n\nCurrent flows round a loop.", "# Circuits\n\nVoltage pushes the current.", "# Circuits\n\nResistance slows it down."];
    // the first page holds it too, but reading forward from page 2 stays on page 2
    expect(pageHolding(pages, "Circuits", 1)).toBe(1);
    expect(pageHolding(pages, "Circuits", 2, false)).toBe(2);
    // a paragraph on an earlier page is still found (skipping back), unless looking forward only
    expect(pageHolding(pages, "Current flows round a loop.", 2)).toBe(0);
    expect(pageHolding(pages, "Current flows round a loop.", 2, false)).toBe(-1);
  });
});
