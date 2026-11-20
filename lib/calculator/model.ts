/**
 * Structured expression model for the calculator: a Row is a list of nodes, template nodes (fraction, root, power,
 * function...) own named slots that are Rows again, and a caret is a path into that tree plus an index in a row.
 * Everything here is pure; edits clone first, so React state is never mutated.
 */
export type FnName = "sin" | "cos" | "tan" | "asin" | "acos" | "atan" | "log" | "ln" | "abs";
export type ConstName = "pi" | "e" | "ans" | "mem";
export type Row = Node[];
export type Node =
  | { t: "ch"; v: string }
  | { t: "const"; v: ConstName }
  | { t: "paren"; body: Row }
  | { t: "frac"; num: Row; den: Row }
  | { t: "sqrt"; body: Row; index: Row | null }
  | { t: "pow"; exp: Row }
  | { t: "fn"; name: FnName; body: Row }
  | { t: "logb"; base: Row; body: Row };

export interface Step { i: number; slot: string }
export interface Caret { path: Step[]; idx: number }
export interface EditorState { root: Row; caret: Caret }

export const emptyState = (): EditorState => ({ root: [], caret: { path: [], idx: 0 } });
export const cloneState = (s: EditorState): EditorState => JSON.parse(JSON.stringify(s)) as EditorState;

export function slotNames(n: Node): string[] {
  switch (n.t) {
    case "frac": return ["num", "den"];
    case "sqrt": return n.index ? ["index", "body"] : ["body"];
    case "pow": return ["exp"];
    case "logb": return ["base", "body"];
    case "paren":
    case "fn": return ["body"];
    default: return [];
  }
}

export function slotRow(n: Node, slot: string): Row {
  const r = (n as unknown as Record<string, Row | null>)[slot];
  if (!Array.isArray(r)) throw new Error("bad slot");
  return r;
}

export function rowAt(root: Row, path: Step[]): Row {
  let row = root;
  for (const s of path) row = slotRow(row[s.i], s.slot);
  return row;
}

const isEmptyNode = (n: Node): boolean => slotNames(n).every((s) => slotRow(n, s).length === 0);
const isNumCh = (n: Node | undefined): boolean => !!n && n.t === "ch" && /^[0-9.]$/.test(n.v);

function endOf(row: Row, path: Step[], i: number, slot: string): Caret {
  const inner = slotRow(row[i], slot);
  return { path: [...path, { i, slot }], idx: inner.length };
}

export function insertNode(st: EditorState, node: Node): EditorState {
  const s = cloneState(st);
  const row = rowAt(s.root, s.caret.path);
  row.splice(s.caret.idx, 0, node);
  s.caret.idx += 1;
  return s;
}

export function insertChar(st: EditorState, v: string): EditorState {
  return insertNode(st, { t: "ch", v });
}

/** Insert a template node and put the caret in its first slot. */
export function insertTemplate(st: EditorState, node: Node): EditorState {
  const s = cloneState(st);
  const row = rowAt(s.root, s.caret.path);
  const at = s.caret.idx;
  const first = slotNames(node)[0];
  if (node.t === "frac") {
    // a number just before the caret becomes the numerator
    let from = at;
    while (from > 0 && isNumCh(row[from - 1])) from--;
    if (from < at) {
      node.num = row.slice(from, at);
      row.splice(from, at - from, node);
      s.caret = { path: [...s.caret.path, { i: from, slot: "den" }], idx: 0 };
      return s;
    }
  }
  row.splice(at, 0, node);
  s.caret = { path: [...s.caret.path, { i: at, slot: first }], idx: 0 };
  return s;
}

/** Insert a power with a ready-made exponent and leave the caret after it (x squared, x inverse). */
export function insertPowerFixed(st: EditorState, exp: Row): EditorState {
  return insertNode(st, { t: "pow", exp });
}

export function closeParen(st: EditorState): EditorState {
  const { path } = st.caret;
  if (!path.length) return st;
  const last = path[path.length - 1];
  const parent = rowAt(st.root, path.slice(0, -1));
  if (parent[last.i].t !== "paren") return st;
  return { root: st.root, caret: { path: path.slice(0, -1), idx: last.i + 1 } };
}

export function moveLeft(st: EditorState): EditorState {
  const { path, idx } = st.caret;
  const row = rowAt(st.root, path);
  if (idx > 0) {
    const prev = row[idx - 1];
    const names = slotNames(prev);
    if (names.length) return { root: st.root, caret: endOf(row, path, idx - 1, names[names.length - 1]) };
    return { root: st.root, caret: { path, idx: idx - 1 } };
  }
  if (!path.length) return st;
  const last = path[path.length - 1];
  const up = path.slice(0, -1);
  const parentRow = rowAt(st.root, up);
  const names = slotNames(parentRow[last.i]);
  const k = names.indexOf(last.slot);
  if (k > 0) return { root: st.root, caret: endOf(parentRow, up, last.i, names[k - 1]) };
  return { root: st.root, caret: { path: up, idx: last.i } };
}

export function moveRight(st: EditorState): EditorState {
  const { path, idx } = st.caret;
  const row = rowAt(st.root, path);
  if (idx < row.length) {
    const names = slotNames(row[idx]);
    if (names.length) return { root: st.root, caret: { path: [...path, { i: idx, slot: names[0] }], idx: 0 } };
    return { root: st.root, caret: { path, idx: idx + 1 } };
  }
  if (!path.length) return st;
  const last = path[path.length - 1];
  const up = path.slice(0, -1);
  const parentRow = rowAt(st.root, up);
  const names = slotNames(parentRow[last.i]);
  const k = names.indexOf(last.slot);
  if (k < names.length - 1) return { root: st.root, caret: { path: [...up, { i: last.i, slot: names[k + 1] }], idx: 0 } };
  return { root: st.root, caret: { path: up, idx: last.i + 1 } };
}

function moveVertical(st: EditorState, from: string, to: string): EditorState {
  const { path, idx } = st.caret;
  for (let d = path.length - 1; d >= 0; d--) {
    const step = path[d];
    if (step.slot !== from) continue;
    const parentRow = rowAt(st.root, path.slice(0, d));
    if (parentRow[step.i].t !== "frac") continue;
    const target = slotRow(parentRow[step.i], to);
    const same = d === path.length - 1;
    return { root: st.root, caret: { path: [...path.slice(0, d), { i: step.i, slot: to }], idx: same ? Math.min(idx, target.length) : target.length } };
  }
  return st;
}
export const moveUp = (st: EditorState): EditorState => moveVertical(st, "den", "num");
export const moveDown = (st: EditorState): EditorState => moveVertical(st, "num", "den");

export function backspace(st: EditorState): EditorState {
  const { path, idx } = st.caret;
  if (idx > 0) {
    const row0 = rowAt(st.root, path);
    const prev = row0[idx - 1];
    const names = slotNames(prev);
    if (names.length && !isEmptyNode(prev)) return moveLeft(st);
    const s = cloneState(st);
    rowAt(s.root, s.caret.path).splice(idx - 1, 1);
    s.caret.idx = idx - 1;
    return s;
  }
  if (!path.length) return st;
  const last = path[path.length - 1];
  const up = path.slice(0, -1);
  const parentRow = rowAt(st.root, up);
  if (isEmptyNode(parentRow[last.i])) {
    const s = cloneState(st);
    rowAt(s.root, up).splice(last.i, 1);
    s.caret = { path: up, idx: last.i };
    return s;
  }
  return moveLeft(st);
}

export function atEnd(st: EditorState): EditorState {
  return { root: st.root, caret: { path: [], idx: st.root.length } };
}

export function caretEquals(c: Caret, path: Step[], idx: number): boolean {
  return c.idx === idx && c.path.length === path.length && c.path.every((s, k) => s.i === path[k].i && s.slot === path[k].slot);
}

export function countNodes(row: Row): number {
  let n = 0;
  for (const node of row) {
    n++;
    for (const s of slotNames(node)) n += countNodes(slotRow(node, s));
  }
  return n;
}

const FN_TEXT: Record<FnName, string> = { sin: "sin", cos: "cos", tan: "tan", asin: "asin", acos: "acos", atan: "atan", log: "log10", ln: "ln", abs: "abs" };

/** Readable one-line text (used for "ask Sprout" prompts and aria labels). */
export function toPlainText(row: Row): string {
  let out = "";
  for (const n of row) {
    switch (n.t) {
      case "ch": out += n.v === "C" ? " nCr " : n.v === "P" ? " nPr " : n.v; break;
      case "const": out += n.v === "pi" ? "pi" : n.v === "mem" ? "M" : n.v; break;
      case "paren": out += `(${toPlainText(n.body)})`; break;
      case "frac": out += `(${toPlainText(n.num)})/(${toPlainText(n.den)})`; break;
      case "sqrt": out += n.index ? `root(${toPlainText(n.index)}, ${toPlainText(n.body)})` : `sqrt(${toPlainText(n.body)})`; break;
      case "pow": out += `^(${toPlainText(n.exp)})`; break;
      case "fn": out += `${FN_TEXT[n.name]}(${toPlainText(n.body)})`; break;
      case "logb": out += `log_(${toPlainText(n.base)})(${toPlainText(n.body)})`; break;
    }
  }
  return out;
}
