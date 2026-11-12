import { describe, expect, it } from "vitest";
import { kcsToMapTree, masteryColours } from "./mind-tree";

describe("kcsToMapTree", () => {
  const kcs = [
    { id: "a", title: "Actuators", order: 1 },
    { id: "m", title: "Motors", order: 2, parentId: "a" },
    { id: "b", title: "Brushless", order: 3, parentId: "m" },
    { id: "s", title: "Sensors", order: 4 },
  ];
  it("nests topics under their parents with the class at the root", () => {
    const t = kcsToMapTree("Robotics", kcs);
    expect(t.title).toBe("Robotics");
    expect(t.children.map((c) => c.id)).toEqual(["a", "s"]);
    expect(t.children[0].children[0].children[0].id).toBe("b");
  });
  it("keeps topics with a missing parent or in a cycle under the root", () => {
    const t = kcsToMapTree("X", [
      { id: "x", title: "X1", parentId: "nope" },
      { id: "p", title: "P", parentId: "q" },
      { id: "q", title: "Q", parentId: "p" },
    ]);
    const all: string[] = [];
    const walk = (n: { id: string; children: unknown[] }) => (all.push(n.id), (n.children as typeof n[]).forEach(walk));
    walk(t);
    expect(all.sort()).toEqual(["p", "q", "root", "x"].sort());
  });
});

describe("masteryColours", () => {
  it("uses lightness steps and a dashed outline for topics not started", () => {
    expect(masteryColours(undefined, false).dash).toBe(true);
    expect(masteryColours(0.3, true).fill).not.toBe(masteryColours(0.9, true).fill);
    expect(masteryColours(0.9, true).text).toBe("#ffffff");
  });
});
