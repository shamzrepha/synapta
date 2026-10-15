import { z } from "zod";

export const MAX_DEPTH = 4; // root is depth 0
export const MAX_NODES = 60;
export const MAX_CHILDREN = 8;
export const MAX_TITLE = 60;

export interface RawNode {
  title: string;
  children?: RawNode[];
}

export const rawNodeSchema: z.ZodType<RawNode> = z.lazy(() =>
  z.object({ title: z.string(), children: z.array(rawNodeSchema).optional() })
);

export interface MapNode {
  id: string;
  title: string;
  children: MapNode[];
}

const cleanTitle = (t: unknown) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);

/**
 * Clamps untrusted model/client output to a safe tree: depth <= MAX_DEPTH, <= MAX_CHILDREN per node,
 * <= MAX_NODES overall (breadth-first so the top levels survive), empty titles dropped, stable ids.
 */
export function clampTree(raw: RawNode): MapNode | null {
  const rootTitle = cleanTitle(raw?.title);
  if (!rootTitle) return null;
  const root: MapNode = { id: "n0", title: rootTitle, children: [] };
  let count = 1;
  const queue: Array<{ src: RawNode; dst: MapNode; depth: number }> = [{ src: raw, dst: root, depth: 0 }];
  while (queue.length) {
    const { src, dst, depth } = queue.shift()!;
    if (depth >= MAX_DEPTH) continue;
    for (const child of (Array.isArray(src.children) ? src.children : []).slice(0, MAX_CHILDREN)) {
      if (count >= MAX_NODES) return root;
      const title = cleanTitle(child?.title);
      if (!title) continue;
      const node: MapNode = { id: `${dst.id}-${dst.children.length}`, title, children: [] };
      dst.children.push(node);
      count++;
      queue.push({ src: child, dst: node, depth: depth + 1 });
    }
  }
  return root;
}

export function countNodes(n: MapNode): number {
  return 1 + n.children.reduce((s, c) => s + countNodes(c), 0);
}

/** Titles from the root down to the node with `id` (empty if not found). */
export function pathTo(root: MapNode, id: string): string[] {
  if (root.id === id) return [root.title];
  for (const c of root.children) {
    const p = pathTo(c, id);
    if (p.length) return [root.title, ...p];
  }
  return [];
}

/* ---------- layout (left-to-right tree) ---------- */

export interface LaidNode {
  id: string;
  title: string;
  depth: number;
  x: number; // left edge
  y: number; // vertical centre
  w: number;
  h: number;
  parentId: string | null;
  hasChildren: boolean;
  collapsed: boolean;
}

export interface Layout {
  nodes: LaidNode[];
  links: Array<{ from: string; to: string }>;
  width: number;
  height: number;
}

export const NODE_H = 36;
const ROW_GAP = 14;
const COL_GAP = 48;
const PAD = 20;
export const DISPLAY_CHARS = 26;

export function displayTitle(t: string): string {
  return t.length > DISPLAY_CHARS ? `${t.slice(0, DISPLAY_CHARS - 1)}…` : t;
}

export function nodeWidth(title: string): number {
  return Math.min(220, Math.max(84, displayTitle(title).length * 7.4 + 36));
}

export function layoutTree(root: MapNode, collapsed: ReadonlySet<string> = new Set()): Layout {
  const nodes: LaidNode[] = [];
  const links: Layout["links"] = [];
  const colWidth: number[] = [];

  // Pass 1: visible nodes' widths per depth
  const measure = (n: MapNode, depth: number) => {
    colWidth[depth] = Math.max(colWidth[depth] || 0, nodeWidth(n.title));
    if (!collapsed.has(n.id)) n.children.forEach((c) => measure(c, depth + 1));
  };
  measure(root, 0);
  const colX: number[] = [];
  colWidth.forEach((w, d) => {
    colX[d] = d === 0 ? PAD : colX[d - 1] + colWidth[d - 1] + COL_GAP;
  });

  // Pass 2: leaves get consecutive rows, parents centre on their children
  let nextRow = 0;
  const place = (n: MapNode, depth: number, parentId: string | null): number => {
    const isCollapsed = collapsed.has(n.id);
    const kids = isCollapsed ? [] : n.children;
    let y: number;
    const idx = nodes.length;
    nodes.push({ id: n.id, title: n.title, depth, x: colX[depth], y: 0, w: colWidth[depth], h: NODE_H, parentId, hasChildren: n.children.length > 0, collapsed: isCollapsed });
    if (kids.length === 0) {
      y = PAD + NODE_H / 2 + nextRow * (NODE_H + ROW_GAP);
      nextRow++;
    } else {
      const ys = kids.map((c) => {
        links.push({ from: n.id, to: c.id });
        return place(c, depth + 1, n.id);
      });
      y = (ys[0] + ys[ys.length - 1]) / 2;
    }
    nodes[idx].y = y;
    return y;
  };
  place(root, 0, null);

  const width = colX[colX.length - 1] + colWidth[colWidth.length - 1] + PAD;
  const height = PAD * 2 + Math.max(1, nextRow) * (NODE_H + ROW_GAP) - ROW_GAP;
  return { nodes, links, width, height };
}
