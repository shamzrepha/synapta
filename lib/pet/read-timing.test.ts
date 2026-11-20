import { describe, expect, it } from "vitest";
import { READ_SYNC, hopDuration, leadClipMs, realLeadMs } from "./read-timing";

const A = { x: 0, y: 0 };
describe("read timing", () => {
  it("the lead grows with the speed", () => {
    expect(realLeadMs(1.25)).toBeGreaterThan(realLeadMs(1));
    expect(realLeadMs(0.85)).toBe(realLeadMs(1));
    expect(leadClipMs(1.25)).toBeGreaterThan(realLeadMs(1.25));
  });
  it("a hop always lands before the word starts", () => {
    for (const rate of [0.85, 1, 1.25, 1.5]) {
      for (const d of [10, 60, 300, 900]) {
        const ms = hopDuration({ from: A, to: { x: d, y: 0 }, wordMs: 300, rate, sameLine: false });
        expect(ms).toBeLessThanOrEqual(realLeadMs(rate) - READ_SYNC.landMarginMs);
        expect(ms).toBeGreaterThanOrEqual(READ_SYNC.minHopMs);
      }
    }
  });
  it("same-line hops are shorter", () => {
    const to = { x: 70, y: 0 };
    const same = hopDuration({ from: A, to, wordMs: 400, rate: 1, sameLine: true });
    const other = hopDuration({ from: A, to, wordMs: 400, rate: 1, sameLine: false });
    expect(same).toBeLessThanOrEqual(READ_SYNC.sameLineMaxMs);
    expect(same).toBeLessThanOrEqual(other);
  });
});
