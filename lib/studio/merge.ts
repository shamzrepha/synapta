/**
 * Three-way merge of Maker Studio specs, so two people can edit one design at the same time.
 *
 *   base   = the version both people started from (the parent commit of the incoming save)
 *   ours   = the current head (what a collaborator already saved)
 *   theirs = the incoming save
 *
 * Rules: top-level keys merge independently. 3D parts, circuit parts, wires, steps, tests and joints merge
 * by `id`; parameters merge by `key`; objects such as a part's `props` merge by key; the program text merges
 * by line (non-overlapping edits combine). Anything else is a single value. A conflict is reported only when
 * BOTH sides changed the same field to different values; the merged spec then keeps the head's value for it.
 * Pure and deterministic: no I/O.
 */

export interface MergeConflict {
  /** where, e.g. "parts[arm].size" or "circuit.wires[w3].to" */
  path: string;
  ours: unknown;
  theirs: unknown;
}

export interface MergeResult<T> {
  spec: T;
  conflicts: MergeConflict[];
  /** how many of the incoming side's changes were applied */
  merged: number;
  /** human-readable list of the applied changes (capped) */
  applied: string[];
}

type Json = unknown;
type Obj = Record<string, Json>;

const isObj = (v: Json): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
export const same = (a: Json, b: Json): boolean => stable(a) === stable(b);

function stable(v: Json): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (isObj(v)) {
    return `{${Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "undefined";
}

/** Which array fields merge element by element, and by which field. */
const KEYED: Record<string, string> = {
  parts: "id",
  params: "key",
  steps: "id",
  tests: "id",
  joints: "id",
  "circuit.parts": "id",
  "circuit.wires": "id",
};

interface Ctx {
  conflicts: MergeConflict[];
  applied: string[];
  merged: number;
}

function note(ctx: Ctx, text: string) {
  ctx.merged++;
  if (ctx.applied.length < 30) ctx.applied.push(text);
}

// ---------------------------------------------------------------- text (line-based diff3)

/** Hunks that turn `base` lines into `side` lines: [baseStart, baseEnd) replaced by `lines`. */
function hunks(base: string[], side: string[]): Array<{ s: number; e: number; lines: string[] }> {
  const m = base.length;
  const n = side.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) lcs[i][j] = base[i] === side[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: Array<{ s: number; e: number; lines: string[] }> = [];
  let i = 0;
  let j = 0;
  let cur: { s: number; e: number; lines: string[] } | null = null;
  const flush = () => {
    if (cur) out.push(cur);
    cur = null;
  };
  while (i < m || j < n) {
    if (i < m && j < n && base[i] === side[j]) {
      flush();
      i++;
      j++;
    } else if (j < n && (i >= m || lcs[i][j + 1] >= lcs[i + 1][j])) {
      cur ??= { s: i, e: i, lines: [] };
      cur.lines.push(side[j++]);
    } else {
      cur ??= { s: i, e: i, lines: [] };
      i++;
      cur.e = i;
    }
  }
  flush();
  return out;
}

/** Three-way line merge. Returns null when the two sides edited the same lines differently. */
export function mergeText(base: string, ours: string, theirs: string): string | null {
  if (ours === theirs) return ours;
  if (base === ours) return theirs;
  if (base === theirs) return ours;
  const B = base.split("\n");
  const ho = hunks(B, ours.split("\n"));
  const ht = hunks(B, theirs.split("\n"));
  // overlapping (or touching inserts at the same spot) hunks conflict
  for (const a of ho) for (const b of ht) {
    const overlap = a.s < b.e && b.s < a.e;
    const sameSpot = a.s === b.s && (a.s === a.e || b.s === b.e);
    if ((overlap || sameSpot) && !(same(a.lines, b.lines) && a.s === b.s && a.e === b.e)) return null;
  }
  const all = [...ho.map((h) => ({ ...h, from: "o" })), ...ht.map((h) => ({ ...h, from: "t" }))].sort((x, y) => x.s - y.s || x.e - y.e);
  const out: string[] = [];
  let pos = 0;
  let lastKey = "";
  for (const h of all) {
    const key = `${h.s}-${h.e}-${h.lines.join("\n")}`;
    if (key === lastKey) continue; // identical change on both sides
    lastKey = key;
    out.push(...B.slice(pos, h.s), ...h.lines);
    pos = h.e;
  }
  out.push(...B.slice(pos));
  return out.join("\n");
}

// ---------------------------------------------------------------- generic values

function mergeValue(path: string, b: Json, o: Json, t: Json, ctx: Ctx): Json {
  if (same(o, t)) return o;
  if (same(b, o)) {
    note(ctx, `${path} changed`);
    return t;
  }
  if (same(b, t)) return o;
  if (typeof o === "string" && typeof t === "string" && (path === "code" || path === "notes")) {
    const m = mergeText(typeof b === "string" ? b : "", o, t);
    if (m !== null) {
      note(ctx, `${path} edited`);
      return m;
    }
  }
  if (isObj(o) && isObj(t) && (isObj(b) || b === undefined)) return mergeObject(path, (b as Obj) || {}, o, t, ctx);
  ctx.conflicts.push({ path, ours: o, theirs: t });
  return o;
}

function mergeObject(path: string, b: Obj, o: Obj, t: Obj, ctx: Ctx): Obj {
  const out: Obj = {};
  const keys = new Set([...Object.keys(o), ...Object.keys(t), ...Object.keys(b)]);
  for (const k of keys) {
    const p = path ? `${path}.${k}` : k;
    const bv = b[k];
    const ov = o[k];
    const tv = t[k];
    let v: Json;
    const listKey = KEYED[p.replace(/\[[^\]]*\]/g, "")];
    if (listKey && (Array.isArray(ov) || Array.isArray(tv) || Array.isArray(bv))) {
      v = mergeKeyed(p, listKey, asList(bv), asList(ov), asList(tv), ctx);
    } else v = mergeValue(p, bv, ov, tv, ctx);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

const asList = (v: Json): Obj[] => (Array.isArray(v) ? (v.filter(isObj) as Obj[]) : []);

function mergeKeyed(path: string, key: string, b: Obj[], o: Obj[], t: Obj[], ctx: Ctx): Obj[] {
  const idOf = (x: Obj) => String(x[key]);
  const B = new Map(b.map((x) => [idOf(x), x]));
  const O = new Map(o.map((x) => [idOf(x), x]));
  const T = new Map(t.map((x) => [idOf(x), x]));
  const order = [...o.map(idOf), ...t.map(idOf).filter((id) => !O.has(id))];
  const out: Obj[] = [];
  const label = (id: string) => `${path}[${id}]`;
  for (const id of order) {
    const bv = B.get(id);
    const ov = O.get(id);
    const tv = T.get(id);
    if (ov && tv) {
      if (same(ov, tv)) out.push(ov);
      else out.push(mergeObject(label(id), bv || {}, ov, tv, ctx));
    } else if (ov && !tv) {
      if (!bv) out.push(ov); // we added it
      else if (same(bv, ov)) note(ctx, `${label(id)} removed`); // they removed it, we left it alone
      else {
        ctx.conflicts.push({ path: label(id), ours: ov, theirs: null }); // they removed what we edited
        out.push(ov);
      }
    } else if (!ov && tv) {
      if (!bv) {
        note(ctx, `${label(id)} added`); // they added it
        out.push(tv);
      } else if (!same(bv, tv)) ctx.conflicts.push({ path: label(id), ours: null, theirs: tv }); // we removed what they edited (stays removed)
      // else: we removed it and they left it alone: stays removed
    }
  }
  return out;
}

// ---------------------------------------------------------------- specs

/** Wires may not point at parts that a merge removed. */
function dropDanglingWires(spec: Obj, ctx: Ctx) {
  const c = spec.circuit;
  if (!isObj(c) || !Array.isArray(c.wires) || !Array.isArray(c.parts)) return;
  const ids = new Set((c.parts as Obj[]).map((p) => String(p.id)));
  const wires = c.wires as Obj[];
  const keep = wires.filter((w) => ids.has(String(w.from).split(".")[0]) && ids.has(String(w.to).split(".")[0]));
  c.wires = keep;
  if (keep.length !== wires.length) ctx.applied.push(`${wires.length - keep.length} wire(s) to removed parts dropped`);
}

export function mergeSpecs<T extends object>(base: T | null, ours: T, theirs: T): MergeResult<T> {
  const ctx: Ctx = { conflicts: [], applied: [], merged: 0 };
  const spec = mergeObject("", (base as Obj) || {}, ours as Obj, theirs as Obj, ctx);
  dropDanglingWires(spec, ctx);
  return { spec: spec as T, conflicts: ctx.conflicts, merged: ctx.merged, applied: ctx.applied };
}
