import { describe, it, expect } from "vitest";
import { mergePages, pageNeedsVision, splitVisionAnswer, cleanVisionText } from "./pages";

describe("reading scanned documents", () => {
  it("sends pages with almost no letters to vision, keeps typed pages on the text layer", () => {
    expect(pageNeedsVision("")).toBe(true);
    expect(pageNeedsVision("12   34  .  -  5")).toBe(true);
    expect(pageNeedsVision("The Pythagorean theorem relates the three sides of a right triangle in a simple way.")).toBe(false);
  });
  it("counts letters of any script as text", () => {
    expect(pageNeedsVision("Ọ bụ ihe ọmụmụ gbasara ọkụ eletrik na ike nke ọ na-ebute n'ime ụlọ akwụkwọ anyị.")).toBe(false);
  });
  it("splits the model's answer back to one text per image", () => {
    const a = "=== PAGE 1 ===\nHello $x^2$\n=== PAGE 2 ===\n[blank page]\n=== PAGE 3 ===\nBye";
    expect(splitVisionAnswer(a, 3)).toEqual(["Hello $x^2$", "[blank page]", "Bye"]);
  });
  it("copes with missing markers and out-of-range pages", () => {
    expect(splitVisionAnswer("just text", 1)).toEqual(["just text"]);
    expect(splitVisionAnswer("just text", 2)).toEqual(["", ""]);
    expect(splitVisionAnswer("=== PAGE 9 ===\nx", 2)).toEqual(["", ""]);
  });
  it("drops blank pages and merges the rest in page order", () => {
    expect(cleanVisionText("[blank page]")).toBe("");
    const t = mergePages([
      { page: 2, text: "two", source: "vision" },
      { page: 1, text: "one", source: "text" },
      { page: 3, text: "", source: "unreadable" },
    ]);
    expect(t).toBe("[Page 1]\none\n\n[Page 2]\ntwo");
  });
});
