import { describe, it, expect } from "vitest";
import { parseCalculatorRequest, extractTutorCalculatorDirective } from "./calc-intent";

describe("Sprout overlay calculator intent parser", () => {
  it("recognizes explicit summon requests with and without extra questions", () => {
    expect(parseCalculatorRequest("open calculator")).toEqual({
      shouldOpen: true,
      calculatorOnly: true,
      expr: null,
    });
    expect(parseCalculatorRequest("hey sprout, bring up the calculator please")).toEqual({
      shouldOpen: true,
      calculatorOnly: true,
      expr: null,
    });
    const withExpr = parseCalculatorRequest("calculate sqrt(144) + 5 * 3");
    expect(withExpr.shouldOpen).toBe(true);
    expect(withExpr.expr).toBe("sqrt(144) + 5 * 3");
  });

  it("ignores normal conceptual prose questions", () => {
    const res = parseCalculatorRequest("What causes tides on Earth and why are there two per day?");
    expect(res.shouldOpen).toBe(false);
    expect(res.expr).toBeNull();
  });

  it("parses and strips Tutor [[tool:calculator]] directives cleanly", () => {
    const parsed = extractTutorCalculatorDirective(
      "Use kinematics: $s = \\frac{1}{2}gt^2$.\n\n[[tool:calculator|expr=0.5 * 9.8 * 5^2|auto=1]]",
      "open calculator and find distance fallen in 5s"
    );
    expect(parsed.cleanText).toBe("Use kinematics: $s = \\frac{1}{2}gt^2$.");
    expect(parsed.shouldSuggest).toBe(true);
    expect(parsed.autoOpen).toBe(true);
    expect(parsed.expr).toBe("0.5 * 9.8 * 5^2");
  });

  it("detects quantitative calculation fallback cleanly without false auto-open", () => {
    const parsed = extractTutorCalculatorDirective(
      "Substitute values: F = 12 * 9.8 = 117.6 N.",
      "How do I find weight of 12kg?"
    );
    expect(parsed.shouldSuggest).toBe(true);
    expect(parsed.autoOpen).toBe(false);
    expect(parsed.expr).toBe("12 * 9.8");
  });
});
