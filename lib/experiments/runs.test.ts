import { describe, it, expect } from "vitest";
import { cleanRun, runSchema } from "./runs";

describe("saved runs", () => {
  it("keeps only real columns, parameters and question ids", () => {
    const input = runSchema.parse({
      experiment: "pendulum",
      params: { length: 1, amp: 20, hacker: 5 },
      rows: [{ length: 1, period: 2.01, evil: 9 }, { nonsense: 1 }],
      solved: ["period", "period", "made-up"],
    });
    const c = cleanRun(input)!;
    expect(c.params).toEqual({ length: 1, amp: 20 });
    expect(c.rows).toEqual([{ length: 1, period: 2.01 }]);
    expect(c.solved).toEqual(["period"]);
    expect(c.title).toBe("Simple pendulum run");
  });
  it("rejects unknown experiments and rows with no valid column", () => {
    expect(cleanRun(runSchema.parse({ experiment: "alchemy", rows: [{ a: 1 }] }))).toBeNull();
    expect(cleanRun(runSchema.parse({ experiment: "gas", rows: [{ zzz: 1 }] }))).toBeNull();
  });
  it("limits the size of a save", () => {
    expect(runSchema.safeParse({ experiment: "gas", rows: [] }).success).toBe(false);
    expect(runSchema.safeParse({ experiment: "gas", rows: Array.from({ length: 61 }, () => ({ P: 1 })) }).success).toBe(false);
    expect(runSchema.safeParse({ experiment: "gas", rows: [{ P: Number.NaN }] }).success).toBe(false);
  });
});
