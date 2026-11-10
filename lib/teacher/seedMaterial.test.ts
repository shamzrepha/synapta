import { describe, expect, it, vi } from "vitest";

const sets: unknown[] = [];
let existingEmpty = true;
vi.mock("@/lib/firebase/admin", () => ({
  Timestamp: { now: () => ({}) },
  adminDb: () => ({
    collection: () => ({
      doc: () => ({
        collection: () => ({
          where: () => ({ limit: () => ({ get: async () => ({ empty: existingEmpty }) }) }),
          doc: () => ({ id: "m1", set: async (d: unknown) => void sets.push(d) }),
        }),
      }),
    }),
  }),
}));

import { saveSeedAsMaterial } from "./seedMaterial";

describe("saveSeedAsMaterial", () => {
  it("saves the notes into the class library", async () => {
    existingEmpty = true;
    expect(await saveSeedAsMaterial("c1", "Chapter 1 ".repeat(20), "u1")).toBe(true);
    expect(sets).toHaveLength(1);
    expect((sets[0] as { extractedText: string }).extractedText).toContain("Chapter 1");
  });
  it("does not save twice and reports it is in the library", async () => {
    existingEmpty = false;
    sets.length = 0;
    expect(await saveSeedAsMaterial("c1", "Chapter 1 ".repeat(20), "u1")).toBe(true);
    expect(sets).toHaveLength(0);
  });
  it("ignores empty or tiny text", async () => {
    expect(await saveSeedAsMaterial("c1", "  ", "u1")).toBe(false);
  });
});
