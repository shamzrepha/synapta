import type { FnName, Node, Row } from "./model";

const MAX_LEN = 500;
const MAX_DEPTH = 30;
const FNS: Record<string, FnName> = {
  sin: "sin", cos: "cos", tan: "tan", asin: "asin", acos: "acos", atan: "atan", arcsin: "asin", arccos: "acos", arctan: "atan",
  ln: "ln", log: "log", log10: "log", abs: "abs",
};

/**
 * Turns typed or Sprout-supplied text such as "9.8*sin(30)+2^3" into the editor tree. Only a fixed vocabulary is
 * accepted (numbers, + - * / ^ ( ) ! %, pi, e, ans, a few function names); anything else returns null, so text can
 * never reach an interpreter.
 */
export function rowFromText(input: string): Row | null {
  const text = String(input ?? "")
    .replace(/π/g, "pi").replace(/×/g, "*").replace(/÷/g, "/").replace(/[−–]/g, "-")
    .replace(/√\s*\(/g, "sqrt(").replace(/√\s*([0-9.]+)/g, "sqrt($1)");
  if (!text.trim() || text.length > MAX_LEN) return null;
  let p = 0;
  let bad = false;
  const fail = (): Row => { bad = true; return []; };
  const ws = () => { while (p < text.length && /\s/.test(text[p])) p++; };

  function seq(depth: number, closing: boolean): Row {
    const row: Row = [];
    if (depth > MAX_DEPTH) return fail();
    for (;;) {
      ws();
      if (bad) return row;
      if (p >= text.length) { if (closing) bad = true; return row; }
      const c = text[p];
      if (c === ")") { if (!closing) bad = true; p++; return row; }
      if (/[0-9.]/.test(c)) { row.push({ t: "ch", v: c }); p++; continue; }
      if (c === "+" || c === "-") { row.push({ t: "ch", v: c }); p++; continue; }
      if (c === "*") { row.push({ t: "ch", v: "×" }); p++; continue; }
      if (c === "/") { row.push({ t: "ch", v: "÷" }); p++; continue; }
      if (c === "!" || c === "%") { row.push({ t: "ch", v: c }); p++; continue; }
      if (c === "^") { p++; row.push({ t: "pow", exp: operand(depth + 1) }); continue; }
      if (c === "(") { p++; row.push({ t: "paren", body: seq(depth + 1, true) }); continue; }
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(p));
      if (!m) return fail();
      p += m[0].length;
      const node = word(m[0].toLowerCase(), depth);
      if (!node) return fail();
      row.push(node);
    }
  }

  function word(w: string, depth: number): Node | null {
    if (w === "pi") return { t: "const", v: "pi" };
    if (w === "e") return { t: "const", v: "e" };
    if (w === "ans") return { t: "const", v: "ans" };
    const isFn = w === "sqrt" || w === "cbrt" || w in FNS;
    if (!isFn || !Object.prototype.hasOwnProperty.call({ sqrt: 1, cbrt: 1, ...FNS }, w)) return null;
    ws();
    if (text[p] !== "(") return null;
    p++;
    const body = seq(depth + 1, true);
    if (w === "sqrt") return { t: "sqrt", body, index: null };
    if (w === "cbrt") return { t: "sqrt", body, index: [{ t: "ch", v: "3" }] };
    return { t: "fn", name: FNS[w], body };
  }

  // exponent operand: optional sign, then a number, constant, or bracketed group
  function operand(depth: number): Row {
    const out: Row = [];
    ws();
    if (text[p] === "-" || text[p] === "+") { out.push({ t: "ch", v: text[p] }); p++; ws(); }
    if (depth > MAX_DEPTH) return fail();
    const c = text[p];
    if (c === "(") { p++; out.push({ t: "paren", body: seq(depth + 1, true) }); return out; }
    if (c !== undefined && /[0-9.]/.test(c)) {
      while (p < text.length && /[0-9.]/.test(text[p])) { out.push({ t: "ch", v: text[p] }); p++; }
      return out;
    }
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(p));
    if (!m) return fail();
    p += m[0].length;
    const node = word(m[0].toLowerCase(), depth);
    if (!node) return fail();
    out.push(node);
    return out;
  }

  const row = seq(0, false);
  return bad || !row.length ? null : row;
}
