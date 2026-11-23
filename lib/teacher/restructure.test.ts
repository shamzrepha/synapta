import { describe, it, expect } from "vitest";
import { restructureKcs, type KcNode } from "./restructure";

const k = (id: string, order: number, extra: Partial<KcNode> = {}): KcNode => ({ id, order, week: 1, prerequisiteIds: [], parentId: null, ...extra });
const apply = (kcs: KcNode[], r: ReturnType<typeof restructureKcs>) => kcs.map((x) => ({ ...x, ...(r.changes.find((c) => c.id === x.id) || {}) }));

describe("restructureKcs", () => {
  it("changes nothing in a class that is already tidy", () => {
    const r = restructureKcs([k("a", 1), k("b", 2, { prerequisiteIds: ["a"] }), k("c", 3, { prerequisiteIds: ["b"] })], { durationWeeks: 4 });
    expect(r.changes).toEqual([]);
    expect(r.summary.changed).toBe(0);
  });
  it("removes prerequisites that point at nothing, at itself, or twice", () => {
    const r = restructureKcs([k("a", 1, { prerequisiteIds: ["a", "ghost"] }), k("b", 2, { prerequisiteIds: ["a", "a"] })], { durationWeeks: 4 });
    const out = apply([k("a", 1, { prerequisiteIds: ["a", "ghost"] }), k("b", 2, { prerequisiteIds: ["a", "a"] })], r);
    expect(out[0].prerequisiteIds).toEqual([]);
    expect(out[1].prerequisiteIds).toEqual(["a"]);
    expect(r.summary.prerequisitesRemoved).toBe(3);
  });
  it("puts prerequisites first", () => {
    const kcs = [k("c", 1, { prerequisiteIds: ["a"] }), k("a", 2), k("b", 3)];
    const out = apply(kcs, restructureKcs(kcs, { durationWeeks: 4 })).sort((x, y) => x.order! - y.order!);
    expect(out.map((x) => x.id)).toEqual(["a", "c", "b"]);
  });
  it("breaks a prerequisite loop instead of looping forever", () => {
    const kcs = [k("a", 1, { prerequisiteIds: ["b"] }), k("b", 2, { prerequisiteIds: ["a"] })];
    const r = restructureKcs(kcs, { durationWeeks: 4 });
    const out = apply(kcs, r);
    const links = out.reduce((n, x) => n + (x.prerequisiteIds?.length || 0), 0);
    expect(links).toBe(1);
    expect(out.map((x) => x.order).sort()).toEqual([1, 2]);
  });
  it("never puts a topic in an earlier week than its prerequisite, and fills missing weeks", () => {
    const kcs = [k("a", 1, { week: 3 }), k("b", 2, { week: 1, prerequisiteIds: ["a"] }), k("c", 3, { week: undefined })];
    const out = apply(kcs, restructureKcs(kcs, { durationWeeks: 6 }));
    expect(out[1].week).toBeGreaterThanOrEqual(out[0].week!);
    expect(out[2].week).toBeGreaterThanOrEqual(out[1].week!);
  });
  it("drops parents that do not exist or loop", () => {
    const kcs = [k("a", 1, { parentId: "ghost" }), k("b", 2, { parentId: "c" }), k("c", 3, { parentId: "b" })];
    const out = apply(kcs, restructureKcs(kcs, { durationWeeks: 4 }));
    expect(out[0].parentId).toBeNull();
    expect(out[1].parentId === null || out[2].parentId === null).toBe(true);
  });
  it("only ever reports structure fields", () => {
    const r = restructureKcs([k("a", 5), k("b", 9)], { durationWeeks: 4 });
    for (const c of r.changes) expect(Object.keys(c).every((x) => ["id", "order", "week", "prerequisiteIds", "parentId"].includes(x))).toBe(true);
  });
});

import { relinkSources } from "./restructure";
describe("relinkSources", () => {
  const mats = [{ id: "m1", title: "Thermodynamics lecture notes.pdf" }, { id: "m2", title: "Circuits week 3.pptx" }];
  it("drops links to deleted files and keeps good ones", () => {
    expect(relinkSources({ id: "a", sourceMaterialIds: ["m1", "gone"] }, mats)).toEqual(["m1"]);
  });
  it("matches a topic with no links to the material with the most shared words, by name only", () => {
    expect(relinkSources({ id: "a", title: "First law of thermodynamics", sourceMaterialIds: [] }, mats)).toEqual(["m1"]);
  });
  it("links to every material when nothing matches, like a class build, and to none when there are none", () => {
    expect(relinkSources({ id: "a", title: "Unrelated", sourceMaterialIds: [] }, mats)).toEqual(["m1", "m2"]);
    expect(relinkSources({ id: "a", title: "x", sourceMaterialIds: ["z"] }, [])).toEqual([]);
  });
  it("is part of the restructure summary", () => {
    const r = restructureKcs([{ id: "a", order: 1, week: 1, title: "Circuits basics", sourceMaterialIds: [] }], { durationWeeks: 4, materials: mats });
    expect(r.summary.sourcesRelinked).toBe(1);
    expect(r.changes[0].sourceMaterialIds).toEqual(["m2"]);
  });
});
