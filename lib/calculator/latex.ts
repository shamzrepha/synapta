import { type Node, type Row, type Caret, caretEquals, slotRow, type Step } from "./model";

const CARET = "\\htmlClass{calc-caret}{\\rule[-0.25em]{1.5px}{1.2em}}";
const BOX = "\\htmlClass{calc-slot}{\\square}";

const CH: Record<string, string> = { "×": "\\times ", "÷": "\\div ", "%": "\\%", C: "\\mathrm{C}", P: "\\mathrm{P}", "-": "-", "+": "+", "!": "!", ".": "." };
const CONST: Record<string, string> = { pi: "\\pi ", e: "\\mathrm{e}", ans: "\\mathrm{Ans}", mem: "\\mathrm{M}" };
const FN: Record<string, string> = {
  sin: "\\sin", cos: "\\cos", tan: "\\tan", asin: "\\sin^{-1}", acos: "\\cos^{-1}", atan: "\\tan^{-1}", log: "\\log", ln: "\\ln",
};

interface Piece { s: string; caret?: boolean }

function row(r: Row, path: Step[], caret: Caret | null, emptyBox: boolean): string {
  const pieces: Piece[] = [];
  const mark = (i: number) => {
    if (caret && caretEquals(caret, path, i)) pieces.push({ s: CARET, caret: true });
  };
  for (let i = 0; i <= r.length; i++) {
    mark(i);
    if (i === r.length) break;
    const n = r[i];
    if (n.t === "pow") {
      const exp = row(n.exp, [...path, { i, slot: "exp" }], caret, true);
      let k = pieces.length - 1;
      while (k >= 0 && pieces[k].caret) k--;
      if (k >= 0) pieces[k] = { s: `{${pieces[k].s}}^{${exp}}` };
      else pieces.push({ s: `{}^{${exp}}` });
    } else pieces.push({ s: node(n, path, i, caret) });
  }
  if (!r.length && emptyBox) pieces.push({ s: BOX });
  return pieces.map((p) => p.s).join("");
}

function node(n: Node, path: Step[], i: number, caret: Caret | null): string {
  const sub = (slot: string) => row(slotRow(n, slot), [...path, { i, slot }], caret, true);
  switch (n.t) {
    case "ch": return /^[0-9]$/.test(n.v) ? n.v : (CH[n.v] ?? "");
    case "const": return CONST[n.v];
    case "paren": return `\\left(${sub("body")}\\right)`;
    case "frac": return `\\frac{${sub("num")}}{${sub("den")}}`;
    case "sqrt": return n.index ? `\\sqrt[${sub("index")}]{${sub("body")}}` : `\\sqrt{${sub("body")}}`;
    case "fn": return n.name === "abs" ? `\\left|${sub("body")}\\right|` : `${FN[n.name]}\\left(${sub("body")}\\right)`;
    case "logb": return `\\log_{${sub("base")}}\\left(${sub("body")}\\right)`;
    case "pow": return "";
  }
}

/** LaTeX for the whole expression; pass a caret to draw it (needs KaTeX `trust` for \htmlClass). */
export function toLatex(root: Row, caret: Caret | null = null): string {
  return row(root, [], caret, false);
}

export const CARET_LATEX = CARET;
