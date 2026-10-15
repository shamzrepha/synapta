import { describe, it, expect } from "vitest";
import { decideNotesSave, mergeNotes } from "./notes";

describe("decideNotesSave", () => {
  it("accepts matching version", () => expect(decideNotesSave(3, 3)).toEqual({ kind: "ok", nextVersion: 4 }));
  it("flags stale version", () => expect(decideNotesSave(4, 3)).toEqual({ kind: "conflict", currentVersion: 4 }));
  it("force overwrites", () => expect(decideNotesSave(4, 1, true)).toEqual({ kind: "ok", nextVersion: 5 }));
});

describe("mergeNotes", () => {
  it("takes the changed side", () => {
    expect(mergeNotes("a", "a", "b")).toEqual({ text: "b", clean: true });
    expect(mergeNotes("a", "b", "a")).toEqual({ text: "b", clean: true });
  });
  it("marks real conflicts", () => {
    const r = mergeNotes("a", "b", "c");
    expect(r.clean).toBe(false);
    expect(r.text).toContain("b");
    expect(r.text).toContain("c");
  });
});
