import { describe, it, expect } from "vitest";
import { latexToUnicode, normalizeMath, readableText } from "./readable";

describe("readable text", () => {
  it("turns common LaTeX into Unicode", () => {
    expect(latexToUnicode("F = m \\times a")).toBe("F = m × a");
    expect(latexToUnicode("E = mc^{2}")).toBe("E = mc²");
    expect(latexToUnicode("\\frac{V}{R}")).toBe("(V)/(R)");
    expect(latexToUnicode("\\sqrt{x}")).toBe("√(x)");
    expect(latexToUnicode("x_{1}")).toBe("x₁");
  });
  it("leaves $...$ math for KaTeX and standardises \\( \\)", () => {
    expect(normalizeMath("Use $\\frac{a}{b}$ here")).toBe("Use $\\frac{a}{b}$ here");
    expect(normalizeMath("Use \\(a^2\\) here")).toBe("Use $a^2$ here");
    expect(normalizeMath("Speed is v = d \\div t")).toBe("Speed is v = d ÷ t");
  });
  it("strips Markdown and math markup for plain places", () => {
    expect(readableText("**Predict** what `x` does")).toBe("Predict what x does");
    expect(readableText("Find $v = \\frac{d}{t}$ now")).toBe("Find v = (d)/(t) now");
    expect(readableText("## Title\n- one")).toBe("Title\none");
    expect(readableText(undefined)).toBe("");
  });
});
