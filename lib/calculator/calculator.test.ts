import { describe, it, expect } from "vitest";
import katex from "katex";
import { applyAction, actionForKey, prepareAfterResult, type Action } from "./actions";
import { emptyState, toPlainText, type EditorState } from "./model";
import { toLatex } from "./latex";
import { evaluateRow, resultLatex, resultText, type EvalResult } from "./eval";
import { rowFromText } from "./from-text";

const run = (actions: Action[], st: EditorState = emptyState()) => actions.reduce(applyAction, st);
const digits = (s: string): Action[] => [...s].map((v) => ({ k: "ch", v }) as Action);
const ev = (text: string, radians = false): EvalResult => {
  const row = rowFromText(text);
  return row ? evaluateRow(row, { radians }) : { kind: "error", error: "syntax", message: "Syntax error" };
};
const show = (text: string, exact = true, radians = false) => {
  const r = ev(text, radians);
  if (r.kind !== "value") return r.kind === "error" ? r.message : "empty";
  return resultText(r.value, exact);
};

describe("editor model", () => {
  it("inserts, moves and deletes", () => {
    let st = run(digits("123"));
    expect(toPlainText(st.root)).toBe("123");
    st = run([{ k: "left" }, { k: "left" }, { k: "ch", v: "9" }], st);
    expect(toPlainText(st.root)).toBe("1923");
    st = run([{ k: "del" }, { k: "del" }], st);
    expect(toPlainText(st.root)).toBe("23");
    expect(run([{ k: "left" }, { k: "left" }, { k: "left" }], st).caret.idx).toBe(0);
  });
  it("fraction wraps the number before the caret and edits inside", () => {
    let st = run([...digits("12"), { k: "frac" }, ...digits("5")]);
    expect(toPlainText(st.root)).toBe("(12)/(5)");
    st = run([{ k: "up" }, { k: "ch", v: "3" }], st);
    expect(toPlainText(st.root)).toBe("(132)/(5)");
    st = run([{ k: "right" }, { k: "right" }, { k: "right" }, { k: "right" }, ...digits("+1")], st);
    expect(toPlainText(st.root)).toBe("(132)/(5)+1");
  });
  it("sqrt, root and power templates", () => {
    expect(toPlainText(run([{ k: "sqrt" }, ...digits("49")]).root)).toBe("sqrt(49)");
    expect(toPlainText(run([{ k: "root" }, ...digits("3"), { k: "right" }, ...digits("8")]).root)).toBe("root(3, 8)");
    const st = run([...digits("2"), { k: "pow" }, ...digits("10")]);
    expect(toPlainText(st.root)).toBe("2^(10)");
    expect(toPlainText(run([...digits("5"), { k: "square" }]).root)).toBe("5^(2)");
  });
  it("backspace removes empty templates, steps into filled ones", () => {
    expect(run([{ k: "frac" }, { k: "del" }]).root).toEqual([]);
    let st = run([{ k: "sqrt" }, ...digits("4"), { k: "right" }]);
    st = run([{ k: "del" }], st);
    expect(st.caret.path.length).toBe(1);
    st = run([{ k: "del" }, { k: "del" }], st);
    expect(st.root).toEqual([]);
  });
  it("closing a bracket leaves the group; stray close does nothing", () => {
    let st = run([{ k: "open" }, ...digits("1+2"), { k: "close" }, ...digits("3")]);
    expect(toPlainText(st.root)).toBe("(1+2)3");
    st = run([{ k: "close" }], emptyState());
    expect(st.root).toEqual([]);
  });
  it("after a result operators continue from Ans, digits restart", () => {
    const st = run(digits("5"));
    expect(toPlainText(applyAction(prepareAfterResult(st, { k: "ch", v: "+" }), { k: "ch", v: "+" }).root)).toBe("ans+");
    expect(prepareAfterResult(st, { k: "ch", v: "7" }).root).toEqual([]);
  });
  it("maps physical keys, ignoring others", () => {
    expect(actionForKey("7")).toEqual({ k: "ch", v: "7" });
    expect(actionForKey("F5")).toBeNull();
    expect(actionForKey("Tab")).toBeNull();
  });
  it("caps expression size", () => {
    let st = emptyState();
    for (let i = 0; i < 600; i++) st = applyAction(st, { k: "ch", v: "1" });
    expect(st.root.length).toBeLessThanOrEqual(400);
  });
});

describe("LaTeX", () => {
  it("renders templates", () => {
    expect(toLatex(run([...digits("1"), { k: "frac" }, ...digits("2")]).root)).toBe("\\frac{1}{2}");
    expect(toLatex(run([{ k: "sqrt" }, ...digits("2")]).root)).toBe("\\sqrt{2}");
    expect(toLatex(run([{ k: "root" }, ...digits("3"), { k: "right" }, ...digits("8")]).root)).toBe("\\sqrt[3]{8}");
    expect(toLatex(run([...digits("2"), { k: "pow" }, ...digits("3")]).root)).toBe("{2}^{3}");
    expect(toLatex(run([{ k: "fn", name: "sin" }, ...digits("30")]).root)).toBe("\\sin\\left(30\\right)");
    expect(toLatex(run([{ k: "const", v: "pi" }]).root)).toBe("\\pi ");
  });
  it("draws the caret next to the base, and a box in empty slots", () => {
    const st = run([...digits("2"), { k: "pow" }]);
    const s = toLatex(st.root, st.caret);
    expect(s).toContain("calc-caret");
    expect(s).toContain("\\square");
  });
  it("is valid KaTeX, caret included", () => {
    const st = run([{ k: "frac" }, { k: "sqrt" }, ...digits("2"), { k: "right" }, { k: "right" }, { k: "fn", name: "atan" }, { k: "logb" }, { k: "open" }]);
    const html = katex.renderToString(toLatex(st.root, st.caret), { throwOnError: true, trust: (c) => c.command === "\\htmlClass" });
    expect(html).toContain("calc-caret");
  });
});

describe("exact arithmetic", () => {
  it("adds fractions exactly", () => {
    expect(show("1/3+1/6")).toBe("1/2");
    expect(show("1/3+1/6", false)).toBe("0.5");
    expect(show("0.5+0.25")).toBe("3/4");
    expect(show("2/4")).toBe("1/2");
    expect(show("1/3*3")).toBe("1");
  });
  it("integer powers, big numbers", () => {
    expect(show("2^10")).toBe("1024");
    expect(show("2^(-2)")).toBe("1/4");
    expect(show("(2/3)^3")).toBe("8/27");
    expect(show("2^100")).toBe("1.26765060023e30");
    expect(show("25!/24!")).toBe("25");
  });
  it("simplifies radicals", () => {
    expect(show("sqrt(8)")).toBe("2sqrt(2)");
    expect(show("sqrt(16)")).toBe("4");
    expect(show("sqrt(2)*sqrt(8)")).toBe("4");
    expect(show("sqrt(1/4)")).toBe("1/2");
    expect(show("1/sqrt(2)")).toBe("sqrt(2)/2");
    expect(show("sqrt(12)+sqrt(3)")).toBe("3sqrt(3)");
    expect(show("sqrt(8)", false)).toBe("2.82842712475");
    expect(show("sqrt(2)+sqrt(3)", true)).toBe("3.14626436994");
  });
  it("nth roots, factorial, nCr, nPr", () => {
    expect(show("cbrt(27)")).toBe("3");
    expect(show("cbrt(-8)")).toBe("-2");
    expect(show("5!")).toBe("120");
    expect(show("0!")).toBe("1");
    const nCr = rowFromText("5")!;
    nCr.push({ t: "ch", v: "C" }, { t: "ch", v: "2" });
    const r = evaluateRow(nCr, { radians: false });
    expect(r.kind === "value" && resultText(r.value, true)).toBe("10");
    nCr[1] = { t: "ch", v: "P" };
    const p = evaluateRow(nCr, { radians: false });
    expect(p.kind === "value" && resultText(p.value, true)).toBe("20");
  });
  it("percent, implicit multiplication, constants, Ans and memory", () => {
    expect(show("50%")).toBe("1/2");
    expect(show("2(3+4)")).toBe("14");
    expect(show("2pi", false)).toBe("6.28318530718");
    const row = rowFromText("ans*2")!;
    const r = evaluateRow(row, { radians: false, ans: { v: 0.5, ex: null } });
    expect(r.kind === "value" && r.value.v).toBe(1);
  });
  it("result LaTeX", () => {
    const f = (t: string) => { const r = ev(t); return r.kind === "value" ? resultLatex(r.value, true) : ""; };
    expect(f("1/2")).toBe("\\frac{1}{2}");
    expect(f("-3/4")).toBe("-\\frac{3}{4}");
    expect(f("sqrt(8)")).toBe("2\\sqrt{2}");
    expect(f("1/sqrt(2)")).toBe("\\frac{\\sqrt{2}}{2}");
    expect(f("2^100")).toBe("1.26765060023\\times 10^{30}");
  });
});

describe("trig and logs", () => {
  it("degrees and radians", () => {
    expect(show("sin(30)")).toBe("1/2");
    expect(show("cos(60)", false)).toBe("0.5");
    expect(show("tan(45)")).toBe("1");
    expect(show("sin(pi/2)", true, true)).toBe("1");
    expect(show("sin(pi)", true, true)).toBe("0");
    expect(show("asin(0.5)", false)).toBe("30");
    expect(show("atan(1)", false, true)).toBe("0.785398163397");
  });
  it("logs", () => {
    expect(show("log(1000)")).toBe("3");
    expect(show("ln(1)")).toBe("0");
    expect(show("ln(e)", false)).toBe("1");
    expect(show("abs(-3/4)")).toBe("3/4");
  });
});

describe("errors", () => {
  it("gives plain messages", () => {
    expect(show("1/0")).toBe("Divide by zero");
    expect(show("0^(-1)")).toBe("Divide by zero");
    expect(show("0^0")).toBe("Math error");
    expect(show("sqrt(-1)")).toBe("Math error");
    expect(show("tan(90)")).toBe("Math error");
    expect(show("asin(2)")).toBe("Math error");
    expect(show("ln(0)")).toBe("Math error");
    expect(show("(-1)!")).toBe("Math error");
    expect(show("171!")).toBe("Math error");
    expect(show("10^400")).toBe("Math error");
    expect(show("2+")).toBe("Syntax error");
    expect(show("(")).toBe("Syntax error");
    expect(show("1..2")).toBe("Syntax error");
  });
  it("evaluates an empty slot as a syntax error, never throws", () => {
    for (const st of [run([{ k: "frac" }]), run([{ k: "sqrt" }]), run([...digits("2"), { k: "pow" }]), run([{ k: "ch", v: "+" }]), run([{ k: "ch", v: "C" }])]) {
      const r = evaluateRow(st.root, { radians: false });
      expect(r.kind).toBe("error");
    }
  });
  it("rejects deep nesting and long input", () => {
    expect(ev("(".repeat(60) + "1" + ")".repeat(60)).kind).toBe("error");
    expect(ev("1+".repeat(400) + "1").kind).toBe("error");
  });
});

describe("injection-style strings", () => {
  it("never accepts code", () => {
    const g = globalThis as unknown as { __pwned?: boolean };
    for (const evil of [
      "constructor(1)", "constructor.constructor('globalThis.__pwned=true')()", "process.exit()", "alert(1)", "this", "globalThis",
      "[].map", "`1`", "1;2", "a=1", "toString()", "__proto__", "(()=>1)()", "hasOwnProperty(1)", "sin(1)//", "1,2", "{}", "'1'", "x", "$(1)",
      "<script>", "1e5", "sqrt", "pi(", "sin 30", "valueOf(1)",
    ]) {
      expect(["error", "empty"].includes(ev(evil).kind) || evil === "1e5", evil).toBe(true);
    }
    expect(g.__pwned).toBeUndefined();
  });
});
