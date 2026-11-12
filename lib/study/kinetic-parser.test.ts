import { describe, it, expect } from "vitest";
import {
  gcd,
  parseKineticBlock,
  stripAndExtractKineticBlocks,
  extractKineticScenesForPage,
} from "./kinetic-parser";

describe("kinetic-parser", () => {
  it("computes gcd accurately", () => {
    expect(gcd(2, 4)).toBe(2);
    expect(gcd(6, 8)).toBe(2);
    expect(gcd(4, 12)).toBe(4);
    expect(gcd(3, 7)).toBe(1);
  });

  it("extracts and strips valid sunroot-motion blocks safely", () => {
    const md = `## Fractions Example

Divide top and bottom cleanly.

\`\`\`sunroot-motion
{
  "kind": "fraction_slash",
  "num": 2,
  "den": 4,
  "caption": "Cancel factor 2"
}
\`\`\`

Keep practicing!`;

    const res = stripAndExtractKineticBlocks(md);
    expect(res.explicitScenes).toHaveLength(1);
    expect(res.explicitScenes[0]).toMatchObject({ kind: "fraction_slash", num: 2, den: 4 });
    expect(res.cleanMarkdown).not.toContain("sunroot-motion");
    expect(res.cleanMarkdown).toContain("Keep practicing!");
  });

  it("rejects malformed or unsafe sunroot-motion payloads gracefully", () => {
    expect(parseKineticBlock("{ not valid json }")).toEqual([]);
    expect(parseKineticBlock(JSON.stringify({ kind: "unknown_hack", code: "alert(1)" }))).toEqual([]);
    expect(parseKineticBlock(JSON.stringify({ kind: "fraction_slash", num: 0, den: 1 }))).toEqual([]);
  });

  it("automatically infers a fraction_slash scene from standard 2/4 markdown", () => {
    const md = "When simplifying $2/4$, divide numerator and denominator by 2 to get $1/2$.";
    const { scenes } = extractKineticScenesForPage(md);
    expect(scenes.some((s) => s.kind === "fraction_slash" && s.num === 2 && s.den === 4 && s.divisor === 2)).toBe(true);
  });

  it("ignores dates and URLs when detecting fractions", () => {
    const md = "Read more at https://example.com/2/4/article posted on 12/04/2026.";
    const { scenes } = extractKineticScenesForPage(md);
    expect(scenes.some((s) => s.kind === "fraction_slash")).toBe(false);
  });

  it("infers equation_steps from multi-line display math", () => {
    const md = `$$
2x + 4 = 10 \\\\
2x = 6 \\\\
x = 3
$$`;
    const { scenes } = extractKineticScenesForPage(md);
    const eq = scenes.find((s) => s.kind === "equation_steps");
    expect(eq).toBeDefined();
    if (eq && eq.kind === "equation_steps") {
      expect(eq.steps.length).toBe(3);
      expect(eq.steps[0].expr).toContain("2x + 4 = 10");
    }
  });

  it("infers formula_breakdown with variable meanings from notes", () => {
    const md = `Newton's Second Law states $F = m \\cdot a$ where:
- F = Force acting on object
- m = Mass in kilograms
- a = Acceleration`;
    const { scenes } = extractKineticScenesForPage(md);
    const f = scenes.find((s) => s.kind === "formula_breakdown");
    expect(f).toBeDefined();
    if (f && f.kind === "formula_breakdown") {
      expect(f.lhs).toBe("F");
      expect(f.parts.map((p) => p.symbol)).toEqual(expect.arrayContaining(["F", "m", "a"]));
    }
  });

  it("infers kid_counter from small arithmetic expressions and concept_flow from arrows", () => {
    const md = "Start here: 3 + 4 = 7.\n\nEvaporation -> Condensation -> Precipitation";
    const { scenes } = extractKineticScenesForPage(md);
    expect(scenes.some((s) => s.kind === "kid_counter")).toBe(true);
    expect(scenes.some((s) => s.kind === "concept_flow")).toBe(true);
  });
});
