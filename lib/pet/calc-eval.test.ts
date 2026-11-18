import { describe, it, expect } from "vitest";
import { evaluateCalculatorInput } from "./calc-eval";

const ev = (s: string, radians = false) => evaluateCalculatorInput(s, { ans: 4, radians });

describe("overlay calculator evaluation", () => {
  it("does the maths", () => {
    expect(ev("2+3*4")).toMatchObject({ kind: "value", value: 14 });
    expect(ev("sqrt(16)+ans")).toMatchObject({ kind: "value", value: 8 });
    expect(ev("sin(30)")).toMatchObject({ kind: "value", text: "0.5" });
    expect(ev("sin(pi/2)", true)).toMatchObject({ kind: "value", value: 1 });
  });
  it("hands back errors instead of throwing", () => {
    for (const bad of ["2+", "(", "foo(1)", "1/0", "sqrt(-1)"]) {
      expect(() => ev(bad), bad).not.toThrow();
      expect(ev(bad).kind, bad).toBe("error");
    }
  });
  it("never returns a non-number from a prototype name", () => {
    // before the fix "constructor(5)" resolved to Object(5)
    expect(ev("constructor(5)").kind).toBe("error");
  });
  it("is empty for nothing, and a graph when x is used", () => {
    expect(ev("  ")).toEqual({ kind: "empty" });
    expect(ev("x^2")).toEqual({ kind: "graph" });
  });
  it("never runs code: JavaScript is not maths", () => {
    const g = globalThis as unknown as { __pwned?: boolean };
    for (const evil of ["constructor(1)", "constructor.constructor('globalThis.__pwned=true')()", "process.exit()", "alert(1)", "this", "globalThis", "[].map", "`1`", "1;2", "a=1", "toString()", "__proto__", "(()=>1)()"]) {
      expect(ev(evil).kind, evil).toBe("error");
    }
    expect(g.__pwned).toBeUndefined();
  });
  it("refuses a very long input", () => {
    expect(ev("1+".repeat(400) + "1").kind).toBe("error");
  });
});
