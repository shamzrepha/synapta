/**
 * Tiny, safe arithmetic evaluator for design parameters ("width + 2 * wall", "pi * r^2").
 * No property access, no calls except a fixed math whitelist — shared designs can't run code here.
 */

const DEG_FUNCS: Record<string, (...a: number[]) => number> = {
  min: Math.min,
  max: Math.max,
  abs: Math.abs,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log,
  log10: Math.log10,
  pow: Math.pow,
  sign: Math.sign,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sin: (d) => Math.sin((d * Math.PI) / 180),
  cos: (d) => Math.cos((d * Math.PI) / 180),
  tan: (d) => Math.tan((d * Math.PI) / 180),
  asin: (x) => (Math.asin(x) * 180) / Math.PI,
  acos: (x) => (Math.acos(x) * 180) / Math.PI,
  atan: (x) => (Math.atan(x) * 180) / Math.PI,
};
const RAD_FUNCS: Record<string, (...a: number[]) => number> = {
  ...DEG_FUNCS,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2, g: 9.81 };

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

function tokenize(rawSrc: string): Tok[] {
  const src = rawSrc.replace(/\bMath\.(sin|cos|tan|asin|acos|atan|sqrt|cbrt|abs|min|max|round|floor|ceil|exp|log|log10|pow|sign|PI|E)\b/g, "$1");
  const raw: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
      if (!m) throw new Error(`Bad number at ${i}`);
      raw.push({ t: "num", v: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      raw.push({ t: "id", v: m[0] });
      i += m[0].length;
      continue;
    }
    if (c === "*" && src[i + 1] === "*") {
      raw.push({ t: "op", v: "^" });
      i += 2;
      continue;
    }
    if ("+-*/^(),%".includes(c)) {
      raw.push({ t: "op", v: c });
      i++;
      continue;
    }
    throw new Error(`Unexpected "${c}"`);
  }
  // Support implicit multiplication: 2x -> 2*x, 2(x+1) -> 2*(x+1), (x+1)(x-1) -> (x+1)*(x-1)
  const out: Tok[] = [];
  for (let k = 0; k < raw.length; k++) {
    const cur = raw[k];
    out.push(cur);
    const nxt = raw[k + 1];
    if (!nxt) continue;
    const curIsVal = cur.t === "num" || (cur.t === "op" && cur.v === ")");
    const nxtStartsVal = nxt.t === "id" || nxt.t === "num" || (nxt.t === "op" && nxt.v === "(");
    if (curIsVal && nxtStartsVal) {
      out.push({ t: "op", v: "*" });
    } else if (cur.t === "id" && nxt.t === "id") {
      out.push({ t: "op", v: "*" });
    }
  }
  return out;
}

/** Evaluates `expr` with the given variables. Throws on unknown names or bad syntax. */
export function evaluate(expr: string, vars: Record<string, number> = {}, opts?: { radians?: boolean }): number {
  if (expr.length > 300) throw new Error("Expression too long");
  const funcs = opts?.radians ? RAD_FUNCS : DEG_FUNCS;
  const lowerVars = new Map<string, number>();
  for (const key of Object.keys(vars)) {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      lowerVars.set(key.toLowerCase(), vars[key]);
    }
  }
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
        const fname = tk.v.toLowerCase();
        // own keys only: "constructor" and friends live on every object's prototype
        const fn = Object.prototype.hasOwnProperty.call(funcs, fname) ? funcs[fname] : undefined;
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
      if (lowerVars.has(k)) return lowerVars.get(k)!;
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
