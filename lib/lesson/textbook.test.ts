import { describe, expect, it } from "vitest";
import { placeInTree, textbookSystemPrompt } from "./textbook";

const kcs = [
  { id: "a", title: "Actuators", order: 1, parentId: null },
  { id: "m", title: "Motors", order: 2, parentId: "a" },
  { id: "b", title: "Brushless motors", order: 3, parentId: "m" },
  { id: "c", title: "Coreless motors", order: 4, parentId: "m" },
  { id: "s", title: "Sensors", order: 5, parentId: null },
];

describe("placeInTree", () => {
  it("numbers topics like a textbook contents", () => {
    expect(placeInTree(kcs, "a")?.number).toBe("1");
    expect(placeInTree(kcs, "m")?.number).toBe("1.1");
    expect(placeInTree(kcs, "c")?.number).toBe("1.1.2");
    expect(placeInTree(kcs, "s")?.number).toBe("2");
  });
  it("knows ancestors, children and siblings", () => {
    const m = placeInTree(kcs, "m")!;
    expect(m.ancestors).toEqual(["Actuators"]);
    expect(m.children.map((c) => c.number + " " + c.title)).toEqual(["1.1.1 Brushless motors", "1.1.2 Coreless motors"]);
    expect(placeInTree(kcs, "b")!.siblings).toEqual(["Coreless motors"]);
  });
  it("copes with missing parents and cycles", () => {
    expect(placeInTree([{ id: "x", title: "X", parentId: "nope" }], "x")?.number).toBe("1");
    expect(placeInTree([{ id: "x", title: "X", parentId: "x" }], "x")?.number).toBe("1");
    expect(placeInTree(kcs, "zzz")).toBeNull();
  });
});

describe("textbookSystemPrompt", () => {
  const base = { classTitle: "Robotics", subject: "Engineering", level: "undergrad", objectives: ["[Understand] How motors work"], design: "" };
  it("writes a chapter introduction for a topic with sub-topics", () => {
    const p = textbookSystemPrompt({ ...base, kcTitle: "Motors", place: placeInTree(kcs, "m") });
    expect(p).toContain("chapter introduction");
    expect(p).toContain("1.1.1 Brushless motors");
    expect(p).not.toContain("## 1.1.1 Brushless");
  });
  it("writes a full section for a leaf topic, numbered under its parent", () => {
    const p = textbookSystemPrompt({ ...base, kcTitle: "Brushless motors", place: placeInTree(kcs, "b") });
    expect(p).toContain("full textbook section");
    expect(p).toContain("## 1.1.1.1 Overview");
    expect(p).toContain("Actuators > Motors");
  });
});
