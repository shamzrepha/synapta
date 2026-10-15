import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/firebase/admin", () => ({ adminDb: () => ({}), Timestamp: { now: () => new Date() } }));
import { pickForLearner, reshuffleOptions, stableId } from "./bank";

const bank = Array.from({ length: 60 }, (_, i) => ({ id: `q${i}`, focus: i % 3 === 0 ? "calculation" : "conceptual" }));

describe("practice bank picking", () => {
  it("serves unseen questions first until the bank is exhausted", () => {
    let seen: string[] = [];
    const served = new Set<string>();
    for (let round = 0; round < 6; round++) {
      const r = pickForLearner(bank, seen, 10);
      r.picked.forEach((q) => {
        expect(served.has(q.id)).toBe(false); // no repeats across the first 60
        served.add(q.id);
      });
      seen = r.seen;
    }
    expect(served.size).toBe(60);
    // 7th quiz recycles the oldest-seen questions
    const r7 = pickForLearner(bank, seen, 10);
    const firstTen = seen.slice(0, 10);
    expect(r7.picked.map((q) => q.id).sort()).toEqual([...firstTen].sort());
  });

  it("honours a focus filter when the pool is big enough", () => {
    const r = pickForLearner(bank, [], 10, Math.random, (q) => q.focus === "calculation");
    expect(r.picked.every((q) => q.focus === "calculation")).toBe(true);
  });

  it("reshuffles options per learner without breaking the answer key", () => {
    const q = { question: "Q", options: ["a", "b", "c", "d"], correctIndex: 2, explanation: "", difficulty: "medium" as const, distractorMisconceptions: ["m0", "m1", "", "m3"] };
    for (let i = 0; i < 20; i++) {
      const s = reshuffleOptions(q);
      expect(s.options[s.correctIndex]).toBe("c");
      expect(s.distractorMisconceptions?.[s.correctIndex]).toBe("");
    }
  });

  it("gives the same id to the same question regardless of spacing/case", () => {
    expect(stableId("What is  Ohm's law?")).toBe(stableId("what is ohm's law?"));
  });
});
