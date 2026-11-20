import { type Node, type Row, countNodes } from "./model";

/** Exact value: q * sqrt(r), r squarefree (1 for plain rationals). */
export interface Rat { n: bigint; d: bigint }
export interface Exact { q: Rat; r: bigint }
export interface Num { v: number; ex: Exact | null }

export type CalcErrorKind = "syntax" | "math" | "div0";
export const ERROR_MESSAGE: Record<CalcErrorKind, string> = { syntax: "Syntax error", math: "Math error", div0: "Divide by zero" };
export class CalcError extends Error {
  constructor(public kind: CalcErrorKind) { super(ERROR_MESSAGE[kind]); }
}
export type EvalResult = { kind: "empty" } | { kind: "value"; value: Num } | { kind: "error"; error: CalcErrorKind; message: string };
export interface EvalContext { radians: boolean; ans?: Num | null; mem?: Num | null }

const MAX_DIGITS = 1200;
const SQRT_LIMIT = BigInt("1000000000000");

const babs = (a: bigint) => (a < BigInt(0) ? -a : a);
function gcd(a: bigint, b: bigint): bigint {
  a = babs(a); b = babs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
function rat(n: bigint, d: bigint = BigInt(1)): Rat {
  if (d === BigInt(0)) throw new CalcError("div0");
  if (d < BigInt(0)) { n = -n; d = -d; }
  const g = gcd(n, d) || BigInt(1);
  return { n: n / g, d: d / g };
}
const rAdd = (a: Rat, b: Rat) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
const rMul = (a: Rat, b: Rat) => rat(a.n * b.n, a.d * b.d);
const rDiv = (a: Rat, b: Rat) => rat(a.n * b.d, a.d * b.n);
const rNeg = (a: Rat): Rat => ({ n: -a.n, d: a.d });
const isZero = (e: Exact) => e.q.n === BigInt(0);

/** m = out^2 * rest with rest squarefree; null when m is too large to factor cheaply. */
function splitSquare(m: bigint): { out: bigint; rest: bigint } | null {
  if (m > SQRT_LIMIT) return null;
  let out = BigInt(1), rest = m;
  for (let i = BigInt(2); i * i <= rest; i++) {
    while (rest % (i * i) === BigInt(0)) { rest /= i * i; out *= i; }
  }
  return { out, rest };
}

const ZERO: Exact = { q: { n: BigInt(0), d: BigInt(1) }, r: BigInt(1) };
const exRat = (n: bigint, d: bigint = BigInt(1)): Exact => ({ q: rat(n, d), r: BigInt(1) });

function toNumber(e: Exact): number {
  const n = Number(e.q.n), d = Number(e.q.d);
  const v = Number.isFinite(n) && Number.isFinite(d) ? (n / d) * Math.sqrt(Number(e.r)) : NaN;
  return v;
}
function guard(e: Exact | null): Exact | null {
  if (!e) return null;
  if (e.q.n.toString().length > MAX_DIGITS || e.q.d.toString().length > MAX_DIGITS) return null;
  return e;
}
function mk(ex: Exact | null, v: number): Num {
  const g = guard(ex);
  if (g) {
    const x = toNumber(g);
    if (Number.isFinite(x)) return { v: x, ex: g };
  }
  return { v, ex: null };
}
const fromInt = (n: number): Num => ({ v: n, ex: Number.isInteger(n) && Math.abs(n) < 2 ** 53 ? exRat(BigInt(n)) : null });
const check = (v: number): number => { if (!Number.isFinite(v)) throw new CalcError("math"); return v; };

function normRadical(q: Rat, r: bigint): Exact | null {
  const s = splitSquare(r);
  if (!s) return null;
  return { q: rMul(q, rat(s.out)), r: s.rest };
}
function exMul(a: Exact, b: Exact): Exact | null {
  return normRadical(rMul(a.q, b.q), a.r * b.r);
}
function exAdd(a: Exact, b: Exact): Exact | null {
  if (isZero(a)) return b;
  if (isZero(b)) return a;
  if (a.r !== b.r) return null;
  const q = rAdd(a.q, b.q);
  return q.n === BigInt(0) ? ZERO : { q, r: a.r };
}
function exDiv(a: Exact, b: Exact): Exact | null {
  if (isZero(b)) throw new CalcError("div0");
  return normRadical(rDiv(rDiv(a.q, b.q), rat(b.r)), a.r * b.r);
}
function exSqrt(a: Exact): Exact | null {
  if (a.r !== BigInt(1)) return null;
  if (a.q.n < BigInt(0)) throw new CalcError("math");
  return normRadical(rat(BigInt(1), a.q.d), a.q.n * a.q.d);
}
function exPowInt(a: Exact, e: bigint): Exact | null {
  if (e === BigInt(0)) return a.r === BigInt(1) && a.q.n === BigInt(0) ? null : exRat(BigInt(1));
  if (babs(e) > BigInt(200)) return null;
  let result: Exact | null = exRat(BigInt(1)), base: Exact | null = a;
  let k = babs(e);
  while (k > BigInt(0) && result && base) {
    if (k & BigInt(1)) result = exMul(result, base);
    k >>= BigInt(1);
    if (k > BigInt(0)) base = guard(exMul(base, base));
    if (result) result = guard(result);
  }
  if (!result) return null;
  return e < BigInt(0) ? exDiv(exRat(BigInt(1)), result) : result;
}

// ---- operations on Num ----
const add = (a: Num, b: Num): Num => mk(a.ex && b.ex ? exAdd(a.ex, b.ex) : null, check(a.v + b.v));
const neg = (a: Num): Num => mk(a.ex ? { q: rNeg(a.ex.q), r: a.ex.r } : null, -a.v);
const sub = (a: Num, b: Num): Num => add(a, neg(b));
const mul = (a: Num, b: Num): Num => mk(a.ex && b.ex ? exMul(a.ex, b.ex) : null, check(a.v * b.v));
function div(a: Num, b: Num): Num {
  if (b.v === 0 || (b.ex && isZero(b.ex))) throw new CalcError("div0");
  return mk(a.ex && b.ex ? exDiv(a.ex, b.ex) : null, check(a.v / b.v));
}
const isInt = (a: Num): boolean => (a.ex ? a.ex.r === BigInt(1) && a.ex.q.d === BigInt(1) : Number.isInteger(a.v));

function snapHalf(v: number): Num {
  check(v);
  for (const d of [1, 2]) {
    const x = v * d;
    if (Math.abs(x - Math.round(x)) < 1e-12) return mk(exRat(BigInt(Math.round(x)), BigInt(d)), v);
  }
  return { v, ex: null };
}

function pow(a: Num, b: Num): Num {
  if (a.v === 0 && b.v === 0) throw new CalcError("math");
  if (a.v === 0 && b.v < 0) throw new CalcError("div0");
  const v = check(Math.pow(a.v, b.v));
  if (a.ex && b.ex) {
    if (b.ex.r === BigInt(1) && b.ex.q.d === BigInt(1)) return mk(exPowInt(a.ex, b.ex.q.n), v);
    if (b.ex.r === BigInt(1) && b.ex.q.n === BigInt(1) && b.ex.q.d === BigInt(2)) return mk(exSqrt(a.ex), v);
  }
  return { v, ex: null };
}
function sqrtNum(a: Num): Num {
  if (a.v < 0) throw new CalcError("math");
  return mk(a.ex ? exSqrt(a.ex) : null, Math.sqrt(a.v));
}
function intRoot(m: bigint, n: number): bigint | null {
  if (m < BigInt(0) || m > BigInt(2) ** BigInt(52)) return null;
  const g = BigInt(Math.round(Math.pow(Number(m), 1 / n)));
  for (const c of [g - BigInt(1), g, g + BigInt(1)]) if (c >= BigInt(0) && c ** BigInt(n) === m) return c;
  return null;
}
function nthRoot(index: Num, x: Num): Num {
  if (!isInt(index) || index.v < 1 || index.v > 1000) throw new CalcError("math");
  const n = Number(index.v);
  if (x.v < 0 && n % 2 === 0) throw new CalcError("math");
  if (n === 2) return sqrtNum(x);
  const v = check(x.v < 0 ? -Math.pow(-x.v, 1 / n) : Math.pow(x.v, 1 / n));
  if (x.ex && x.ex.r === BigInt(1)) {
    const sign = x.ex.q.n < BigInt(0) ? -BigInt(1) : BigInt(1);
    const a = intRoot(babs(x.ex.q.n), n), b = intRoot(x.ex.q.d, n);
    if (a !== null && b !== null) return mk(exRat(sign * a, b), v);
  }
  return { v, ex: null };
}

function factorial(a: Num): Num {
  if (!isInt(a) || a.v < 0 || a.v > 170) throw new CalcError("math");
  let r = BigInt(1);
  for (let i = BigInt(2); i <= BigInt(a.v); i++) r *= i;
  return mk(exRat(r), Number(r));
}
function comb(n: Num, r: Num, perm: boolean): Num {
  if (!isInt(n) || !isInt(r) || n.v < 0 || r.v < 0 || r.v > n.v || n.v > 1000) throw new CalcError("math");
  const N = BigInt(n.v), R = BigInt(r.v);
  let out = BigInt(1);
  if (perm) for (let i = BigInt(0); i < R; i++) out *= N - i;
  else {
    const k = R < N - R ? R : N - R;
    for (let i = BigInt(0); i < k; i++) out = (out * (N - i)) / (i + BigInt(1));
  }
  return mk(exRat(out), check(Number(out)));
}

function trig(name: string, x: Num, ctx: EvalContext): Num {
  const rad = ctx.radians ? x.v : (x.v * Math.PI) / 180;
  switch (name) {
    case "sin": return snapHalf(Math.sin(rad));
    case "cos": return snapHalf(Math.cos(rad));
    case "tan": {
      if (Math.abs(Math.cos(rad)) < 1e-12) throw new CalcError("math");
      return snapHalf(Math.tan(rad));
    }
  }
  if (x.v < -1 && name !== "atan") throw new CalcError("math");
  if (x.v > 1 && name !== "atan") throw new CalcError("math");
  const r = name === "asin" ? Math.asin(x.v) : name === "acos" ? Math.acos(x.v) : Math.atan(x.v);
  return snapHalf(ctx.radians ? r : (r * 180) / Math.PI);
}

function logBase(base: Num, x: Num): Num {
  if (x.v <= 0 || base.v <= 0 || base.v === 1) throw new CalcError("math");
  const v = check(Math.log(x.v) / Math.log(base.v));
  const k = Math.round(v);
  if (Math.abs(v - k) < 1e-12 && Math.abs(Math.pow(base.v, k) - x.v) <= 1e-9 * Math.abs(x.v)) return mk(exRat(BigInt(k)), k);
  return { v, ex: null };
}

function applyFn(name: string, x: Num, ctx: EvalContext): Num {
  switch (name) {
    case "abs": return mk(x.ex ? { q: { n: babs(x.ex.q.n), d: x.ex.q.d }, r: x.ex.r } : null, Math.abs(x.v));
    case "ln": {
      if (x.v <= 0) throw new CalcError("math");
      return x.v === 1 ? fromInt(0) : { v: Math.log(x.v), ex: null };
    }
    case "log": return logBase(fromInt(10), x);
    default: return trig(name, x, ctx);
  }
}

// ---- parsing / evaluation over the tree ----
type Tok = { k: "num"; n: Num } | { k: "op"; v: string } | { k: "node"; node: Node };

function decimal(text: string): Num {
  if (!/^(\d+\.?\d*|\.\d+)$/.test(text)) throw new CalcError("syntax");
  const [i, f = ""] = text.split(".");
  const digits = (i + f).replace(/^0+(?=\d)/, "") || "0";
  const ex = digits.length > 40 ? null : exRat(BigInt(digits), BigInt(10) ** BigInt(f.length));
  return mk(ex, Number(text));
}

function tokenize(row: Row): Tok[] {
  const out: Tok[] = [];
  let buf = "";
  const flush = () => { if (buf) { out.push({ k: "num", n: decimal(buf) }); buf = ""; } };
  for (const n of row) {
    if (n.t === "ch" && /^[0-9.]$/.test(n.v)) buf += n.v;
    else {
      flush();
      if (n.t === "ch") out.push({ k: "op", v: n.v });
      else out.push({ k: "node", node: n });
    }
  }
  flush();
  return out;
}

class Parser {
  private pos = 0;
  private toks: Tok[];
  constructor(row: Row, private ctx: EvalContext, private depth: number) {
    if (depth > 40) throw new CalcError("syntax");
    this.toks = tokenize(row);
  }
  run(): Num {
    if (!this.toks.length) throw new CalcError("syntax");
    const v = this.expr();
    if (this.pos < this.toks.length) throw new CalcError("syntax");
    return v;
  }
  private peek(): Tok | undefined { return this.toks[this.pos]; }
  private isOp(...vs: string[]): boolean { const t = this.peek(); return !!t && t.k === "op" && vs.includes(t.v); }
  private expr(): Num {
    let l = this.term();
    while (this.isOp("+", "-")) {
      const op = (this.toks[this.pos++] as { v: string }).v;
      const r = this.term();
      l = op === "+" ? add(l, r) : sub(l, r);
    }
    return l;
  }
  private startsPrimary(): boolean {
    const t = this.peek();
    return !!t && (t.k === "num" || (t.k === "node" && t.node.t !== "pow"));
  }
  private term(): Num {
    let l = this.unary();
    for (;;) {
      if (this.isOp("×", "÷")) {
        const op = (this.toks[this.pos++] as { v: string }).v;
        const r = this.unary();
        l = op === "×" ? mul(l, r) : div(l, r);
      } else if (this.startsPrimary()) l = mul(l, this.comb());
      else return l;
    }
  }
  private unary(): Num {
    if (this.isOp("-")) { this.pos++; return neg(this.unary()); }
    if (this.isOp("+")) { this.pos++; return this.unary(); }
    return this.comb();
  }
  private comb(): Num {
    let l = this.postfix();
    while (this.isOp("C", "P")) {
      const perm = (this.toks[this.pos++] as { v: string }).v === "P";
      l = comb(l, this.postfix(), perm);
    }
    return l;
  }
  private postfix(): Num {
    let v = this.primary();
    for (;;) {
      const t = this.peek();
      if (t && t.k === "op" && t.v === "!") { this.pos++; v = factorial(v); }
      else if (t && t.k === "op" && t.v === "%") { this.pos++; v = div(v, fromInt(100)); }
      else if (t && t.k === "node" && t.node.t === "pow") { this.pos++; v = pow(v, this.sub(t.node.exp)); }
      else return v;
    }
  }
  private sub(row: Row): Num { return new Parser(row, this.ctx, this.depth + 1).run(); }
  private primary(): Num {
    const t = this.toks[this.pos++];
    if (!t) throw new CalcError("syntax");
    if (t.k === "num") return t.n;
    if (t.k === "op") throw new CalcError("syntax");
    const n = t.node;
    switch (n.t) {
      case "const":
        if (n.v === "pi") return { v: Math.PI, ex: null };
        if (n.v === "e") return { v: Math.E, ex: null };
        return (n.v === "ans" ? this.ctx.ans : this.ctx.mem) ?? fromInt(0);
      case "paren": return this.sub(n.body);
      case "frac": return div(this.sub(n.num), this.sub(n.den));
      case "sqrt": return n.index ? nthRoot(this.sub(n.index), this.sub(n.body)) : sqrtNum(this.sub(n.body));
      case "fn": return applyFn(n.name, this.sub(n.body), this.ctx);
      case "logb": return logBase(this.sub(n.base), this.sub(n.body));
      default: throw new CalcError("syntax");
    }
  }
}

export function evaluateRow(row: Row, ctx: EvalContext): EvalResult {
  if (!row.length) return { kind: "empty" };
  try {
    if (countNodes(row) > 400) throw new CalcError("syntax");
    const value = new Parser(row, ctx, 0).run();
    if (!Number.isFinite(value.v)) throw new CalcError("math");
    return { kind: "value", value };
  } catch (e) {
    const error = e instanceof CalcError ? e.kind : e instanceof RangeError ? "math" : "syntax";
    return { kind: "error", error, message: ERROR_MESSAGE[error] };
  }
}

// ---- formatting ----
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "Math error";
  if (Math.abs(n) < 1e-12) return "0";
  if (Math.abs(n) >= 1e10 || Math.abs(n) < 1e-6) return n.toExponential(11).replace(/\.?0+e/, "e").replace("e+", "e");
  return Number(n.toPrecision(12)).toString();
}

const ratText = (q: Rat) => (q.d === BigInt(1) ? q.n.toString() : `${q.n}/${q.d}`);

/** Whether an exact display differs from the decimal one (so the S<->D toggle means something). */
export function hasExactForm(n: Num): boolean {
  return !!n.ex && (n.ex.r !== BigInt(1) || n.ex.q.d !== BigInt(1)) && n.ex.q.n.toString().length < 30 && n.ex.q.d.toString().length < 30;
}

export function resultText(n: Num, exact: boolean): string {
  if (exact && n.ex && hasExactForm(n)) {
    const { q, r } = n.ex;
    if (r === BigInt(1)) return ratText(q);
    return `${q.n === BigInt(1) ? "" : q.n === -BigInt(1) ? "-" : q.n}sqrt(${r})${q.d === BigInt(1) ? "" : `/${q.d}`}`;
  }
  return formatNumber(n.v);
}

export function resultLatex(n: Num, exact: boolean): string {
  if (exact && n.ex && hasExactForm(n)) {
    const { q, r } = n.ex;
    const sign = q.n < BigInt(0) ? "-" : "";
    const a = babs(q.n);
    if (r === BigInt(1)) return q.d === BigInt(1) ? `${sign}${a}` : `${sign}\\frac{${a}}{${q.d}}`;
    const root = `${a === BigInt(1) ? "" : a}\\sqrt{${r}}`;
    return q.d === BigInt(1) ? `${sign}${root}` : `${sign}\\frac{${root}}{${q.d}}`;
  }
  const t = formatNumber(n.v);
  return t.replace(/^(-?[\d.]+)e(-?\d+)$/, "$1\\times 10^{$2}");
}

export function numFromNumber(v: number): Num { return Number.isFinite(v) ? { v, ex: null } : fromInt(0); }
