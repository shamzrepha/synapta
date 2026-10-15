import { describe, it, expect, vi } from "vitest";

// Strict transaction mock: like Firestore, any read after a write throws.
const writes: Array<{ op: string; path: string }> = [];
vi.mock("@/lib/firebase/admin", () => {
  const ref = (path: string) => ({ path });
  return {
    adminDb: () => ({
      collection: (c: string) => ({ doc: (id: string) => ref(`${c}/${id}`) }),
      runTransaction: async (fn: (t: unknown) => Promise<unknown>) => {
        let wrote = false;
        const t = {
          get: async (r: { path: string }) => {
            if (wrote) throw new Error("Firestore transactions require all reads to be executed before all writes.");
            return { exists: r.path.startsWith("users/"), data: () => ({ usagePeriod: "2000-01" }) };
          },
          update: (r: { path: string }) => {
            wrote = true;
            writes.push({ op: "update", path: r.path });
          },
          set: (r: { path: string }) => {
            wrote = true;
            writes.push({ op: "set", path: r.path });
          },
        };
        return fn(t);
      },
    }),
    FieldValue: { increment: (n: number) => n },
    Timestamp: { now: () => new Date() },
  };
});

import { recordTokenUsage } from "./guard";

describe("recordTokenUsage", () => {
  it("does all reads before writes (regression: flashcards 'Internal error')", async () => {
    await expect(recordTokenUsage("u1", 100, 50)).resolves.toBeUndefined();
    expect(writes.map((w) => w.path)).toEqual(expect.arrayContaining(["users/u1", expect.stringMatching(/^usage\/u1_/)]));
  });
});
