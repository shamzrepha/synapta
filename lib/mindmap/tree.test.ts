import { describe, it, expect } from "vitest";
import { clampTree, countNodes, layoutTree, pathTo, MAX_DEPTH, MAX_NODES, MAX_CHILDREN, rawNodeSchema, type RawNode } from "./tree";

describe("clampTree", () => {
  it("rejects an empty root", () => {
    expect(clampTree({ title: "  " })).toBeNull();
  });

  it("limits depth", () => {
    let node: RawNode = { title: "leaf" };
    for (let i = 0; i < 10; i++) node = { title: `L${i}`, children: [node] };
    const t = clampTree(node)!;
    let depth = 0;
    let cur = t;
    while (cur.children[0]) {
      cur = cur.children[0];
      depth++;
    }
    expect(depth).toBe(MAX_DEPTH);
  });

  it("limits children per node and total nodes, keeping top levels", () => {
    const wide: RawNode = {
      title: "root",
      children: Array.from({ length: 30 }, (_, i) => ({
        title: `c${i}`,
        children: Array.from({ length: 30 }, (_, j) => ({ title: `g${i}-${j}` })),
      })),
    };
    const t = clampTree(wide)!;
    expect(t.children).toHaveLength(MAX_CHILDREN);
    expect(countNodes(t)).toBeLessThanOrEqual(MAX_NODES);
    expect(countNodes(t)).toBe(MAX_NODES);
  });

  it("drops empty titles, trims long ones and assigns unique ids", () => {
    const t = clampTree({ title: "R", children: [{ title: "" }, { title: "x".repeat(200) }, { title: "ok", children: [{ title: "deep" }] }] })!;
    expect(t.children.map((c) => c.title.length)).toEqual([60, 2]);
    const ids = new Set<string>();
    const walk = (n: typeof t) => {
      ids.add(n.id);
      n.children.forEach(walk);
    };
    walk(t);
    expect(ids.size).toBe(countNodes(t));
    expect(pathTo(t, t.children[1].children[0].id)).toEqual(["R", "ok", "deep"]);
  });

  it("validates with the zod schema", () => {
    expect(rawNodeSchema.safeParse({ title: "a", children: [{ title: "b" }] }).success).toBe(true);
    expect(rawNodeSchema.safeParse({ title: 1 }).success).toBe(false);
  });
});

describe("layoutTree", () => {
  const tree = clampTree({ title: "Root", children: [{ title: "A", children: [{ title: "A1" }, { title: "A2" }] }, { title: "B" }] })!;

  it("places every visible node, parents centred on children, columns by depth", () => {
    const l = layoutTree(tree);
    expect(l.nodes).toHaveLength(5);
    expect(l.links).toHaveLength(4);
    const by = Object.fromEntries(l.nodes.map((n) => [n.title, n]));
    expect(by.A.y).toBeCloseTo((by.A1.y + by.A2.y) / 2);
    expect(by.A1.x).toBeGreaterThan(by.A.x);
    expect(by.A.x).toBeGreaterThan(by.Root.x);
    expect(l.width).toBeGreaterThan(by.A1.x);
    expect(l.height).toBeGreaterThan(by.B.y);
  });

  it("hides the subtree of collapsed nodes", () => {
    const a = tree.children[0];
    const l = layoutTree(tree, new Set([a.id]));
    expect(l.nodes.map((n) => n.title)).toEqual(["Root", "A", "B"]);
    expect(l.nodes.find((n) => n.title === "A")).toMatchObject({ collapsed: true, hasChildren: true });
  });
});
