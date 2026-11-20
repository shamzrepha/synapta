import type { Action } from "@/lib/calculator/actions";

export type UiAction = "shift" | "deg" | "mode" | "eval" | "mplus" | "mminus" | "mr" | "mc" | "ans";
export type KeyAction = Action | { k: "ui"; v: UiAction };
export type Tone = "digit" | "op" | "fn" | "eq" | "danger" | "mode";

export interface KeyDef {
  label: string;
  aria: string;
  action: KeyAction;
  tone: Tone;
  shift?: { label: string; aria: string; action: KeyAction };
  span?: number;
}

const ch = (v: string): KeyAction => ({ k: "ch", v });
const ui = (v: UiAction): KeyAction => ({ k: "ui", v });
const digit = (d: string): KeyDef => ({ label: d, aria: d, action: ch(d), tone: "digit" });
const fn = (name: "sin" | "cos" | "tan", inv: "asin" | "acos" | "atan"): KeyDef => ({
  label: name, aria: name, action: { k: "fn", name }, tone: "fn",
  shift: { label: `${name}⁻¹`, aria: `inverse ${name}`, action: { k: "fn", name: inv } },
});

export const KEYS: KeyDef[] = [
  { label: "2nd", aria: "second function", action: ui("shift"), tone: "mode" },
  { label: "◀", aria: "move cursor left", action: { k: "left" }, tone: "mode" },
  { label: "▶", aria: "move cursor right", action: { k: "right" }, tone: "mode" },
  { label: "DEG", aria: "angle mode degrees", action: ui("deg"), tone: "mode" },
  { label: "S⇔D", aria: "switch exact and decimal", action: ui("mode"), tone: "mode" },
  { label: "AC", aria: "clear all", action: { k: "clear" }, tone: "danger" },

  { label: "a/b", aria: "fraction", action: { k: "frac" }, tone: "fn" },
  { label: "√", aria: "square root", action: { k: "sqrt" }, tone: "fn", shift: { label: "ⁿ√", aria: "nth root", action: { k: "root" } } },
  { label: "xʸ", aria: "power", action: { k: "pow" }, tone: "fn", shift: { label: "x²", aria: "square", action: { k: "square" } } },
  { label: "(", aria: "open bracket", action: { k: "open" }, tone: "fn" },
  { label: ")", aria: "close bracket", action: { k: "close" }, tone: "fn" },
  { label: "⌫", aria: "backspace", action: { k: "del" }, tone: "danger" },

  fn("sin", "asin"), fn("cos", "acos"), fn("tan", "atan"),
  { label: "log", aria: "logarithm base 10", action: { k: "fn", name: "log" }, tone: "fn", shift: { label: "10ˣ", aria: "ten to the power", action: { k: "pow10" } } },
  { label: "ln", aria: "natural logarithm", action: { k: "fn", name: "ln" }, tone: "fn", shift: { label: "eˣ", aria: "e to the power", action: { k: "powe" } } },
  { label: "π", aria: "pi", action: { k: "const", v: "pi" }, tone: "fn", shift: { label: "e", aria: "Euler's number e", action: { k: "const", v: "e" } } },

  digit("7"), digit("8"), digit("9"),
  { label: "÷", aria: "divide", action: ch("÷"), tone: "op" },
  { label: "n!", aria: "factorial", action: ch("!"), tone: "fn", shift: { label: "nCr", aria: "combinations", action: ch("C") } },
  { label: "|x|", aria: "absolute value", action: { k: "fn", name: "abs" }, tone: "fn", shift: { label: "nPr", aria: "permutations", action: ch("P") } },

  digit("4"), digit("5"), digit("6"),
  { label: "×", aria: "multiply", action: ch("×"), tone: "op" },
  { label: "Ans", aria: "previous answer", action: ui("ans"), tone: "fn", shift: { label: "logₐ", aria: "logarithm with any base", action: { k: "logb" } } },
  { label: "M+", aria: "add to memory", action: ui("mplus"), tone: "fn", shift: { label: "M−", aria: "subtract from memory", action: ui("mminus") } },

  digit("1"), digit("2"), digit("3"),
  { label: "−", aria: "minus", action: ch("-"), tone: "op" },
  { label: "MR", aria: "recall memory", action: ui("mr"), tone: "fn", shift: { label: "MC", aria: "clear memory", action: ui("mc") } },
  { label: "%", aria: "percent", action: ch("%"), tone: "fn", shift: { label: "x⁻¹", aria: "reciprocal", action: { k: "inv" } } },

  digit("0"), { label: ".", aria: "decimal point", action: ch("."), tone: "digit" },
  { label: "(−)", aria: "negative sign", action: ch("-"), tone: "digit" },
  { label: "+", aria: "plus", action: ch("+"), tone: "op" },
  { label: "=", aria: "equals", action: ui("eval"), tone: "eq", span: 2 },
];
