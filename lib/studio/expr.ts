/**
 * Tiny, safe arithmetic evaluator for design parameters ("width + 2 * wall", "pi * r^2").
 * No property access, no calls except a fixed math whitelist — shared designs can't run code here.
 */

const FUNCS: Record<string, (...a: number[]) => number> = {
  min: Math.min,
  max: Math.max,
  abs: Math.abs,
  sqrt: Math.sqrt,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sin: (d) => Math.sin((d * Math.PI) / 180),
  cos: (d) => Math.cos((d * Math.PI) / 180),
  tan: (d) => Math.tan((d * Math.PI) / 180),
};
const CONSTS: Record<string, number> = { pi: Math.PI, g: 9.81 };

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
      if (!m) throw new Error(`Bad number at ${i}`);
      out.push({ t: "num", v: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ t: "id", v: m[0] });
      i += m[0].length;
      continue;
    }
    if ("+-*/^(),%".includes(c)) {
      out.push({ t: "op", v: c });
      i++;
      continue;
    }
    throw new Error(`Unexpected "${c}"`);
  }
  return out;
}

/** Evaluates `expr` with the given variables. Throws on unknown names or bad syntax. */
export function evaluate(expr: string, vars: Record<string, number> = {}): number {
  if (expr.length > 300) throw new Error("Expression too long");
  const toks = tokenize(expr);
  let p = 0;
  const peek = () => toks[p];
  const take = (v?: string) => {
    const tk = toks[p];
    if (!tk || (v !== undefined && !(tk.t === "op" && tk.v === v))) throw new Error(`Expected ${v ?? "a value"}`);
    p++;
    return tk;
  };
  // expr := term (('+'|'-') term)*
  function parseExpr(): number {
    let v = parseTerm();
    while (peek()?.t === "op" && (peek()!.v === "+" || peek()!.v === "-")) {
      const op = take().v;
      const r = parseTerm();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  function parseTerm(): number {
    let v = parseUnary();
    while (peek()?.t === "op" && ["*", "/", "%"].includes(String(peek()!.v))) {
      const op = take().v;
      const r = parseUnary();
      v = op === "*" ? v * r : op === "/" ? v / r : v % r;
    }
    return v;
  }
  function parseUnary(): number {
    if (peek()?.t === "op" && peek()!.v === "-") {
      take();
      return -parseUnary();
    }
    if (peek()?.t === "op" && peek()!.v === "+") {
      take();
      return parseUnary();
    }
    return parsePow();
  }
  function parsePow(): number {
    const base = parseAtom();
    if (peek()?.t === "op" && peek()!.v === "^") {
      take();
      return Math.pow(base, parseUnary());
    }
    return base;
  }
  function parseAtom(): number {
    const tk = peek();
    if (!tk) throw new Error("Unexpected end");
    if (tk.t === "num") {
      p++;
      return tk.v;
    }
    if (tk.t === "op" && tk.v === "(") {
      take("(");
      const v = parseExpr();
      take(")");
      return v;
    }
    if (tk.t === "id") {
      p++;
      if (peek()?.t === "op" && peek()!.v === "(") {
        const fn = FUNCS[tk.v.toLowerCase()];
        if (!fn) throw new Error(`Unknown function ${tk.v}`);
        take("(");
        const args: number[] = [];
        if (!(peek()?.t === "op" && peek()!.v === ")")) {
          args.push(parseExpr());
          while (peek()?.t === "op" && peek()!.v === ",") {
            take(",");
            args.push(parseExpr());
          }
        }
        take(")");
        return fn(...args);
      }
      if (Object.prototype.hasOwnProperty.call(vars, tk.v)) return vars[tk.v];
      const k = tk.v.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(CONSTS, k)) return CONSTS[k];
      throw new Error(`Unknown name ${tk.v}`);
    }
    throw new Error(`Unexpected "${tk.v}"`);
  }
  const v = parseExpr();
  if (p !== toks.length) throw new Error("Unexpected trailing input");
  if (!Number.isFinite(v)) throw new Error("Result is not a finite number");
  return v;
}

/** Numbers pass through; strings are evaluated; anything invalid falls back. */
export function num(v: unknown, vars: Record<string, number>, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    try {
      return evaluate(v, vars);
    } catch {
      return fallback;
    }
  }
  return fallback;
}
