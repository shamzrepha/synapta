import { describe, it, expect } from "vitest";
import { isWeekId, lastWeekId, pickWinners, previousWeekId, rankEntries, weekIdFor, weekStart } from "./week";

describe("iso week helpers", () => {
  it("computes ISO week ids across year boundaries", () => {
    expect(weekIdFor(new Date("2026-10-15T12:00:00Z"))).toBe("2026-W42");
    expect(weekIdFor(new Date("2021-01-03T12:00:00Z"))).toBe("2020-W53");
    expect(weekIdFor(new Date("2024-12-30T12:00:00Z"))).toBe("2025-W01");
  });
  it("week start is a Monday and round-trips", () => {
    for (const id of ["2026-W42", "2020-W53", "2025-W01", "2026-W01"]) {
      const d = weekStart(id);
      expect(d.getUTCDay()).toBe(1);
      expect(weekIdFor(d)).toBe(id);
    }
    expect(weekStart("2026-W42").toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });
  it("previous week handles year changes", () => {
    expect(previousWeekId("2026-W42")).toBe("2026-W41");
    expect(previousWeekId("2025-W01")).toBe("2024-W52");
    expect(previousWeekId("2021-W01")).toBe("2020-W53");
    expect(lastWeekId(new Date("2026-10-15T00:00:00Z"))).toBe("2026-W41");
  });
  it("validates week ids", () => {
    expect(isWeekId("2026-W42")).toBe(true);
    expect(isWeekId("2026-W54")).toBe(false);
    expect(isWeekId("../x")).toBe(false);
  });
  it("ranks and picks winners deterministically", () => {
    const e = [
      { uid: "b", xp: 50 },
      { uid: "a", xp: 50 },
      { uid: "c", xp: 90 },
      { uid: "d", xp: 0 },
      { uid: "e", xp: 10 },
    ];
    expect(rankEntries(e).map((r) => r.uid)).toEqual(["c", "a", "b", "e"]);
    expect(pickWinners(e).map((r) => [r.uid, r.rank])).toEqual([["c", 1], ["a", 2], ["b", 3]]);
    expect(pickWinners([])).toEqual([]);
  });
});
