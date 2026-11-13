import { describe, it, expect } from "vitest";
import { nextStreak } from "./streak";

describe("streaks with freezes", () => {
  it("extends on consecutive days and keeps same-day activity unchanged", () => {
    expect(nextStreak({ current: 3, lastActiveDate: "2026-10-14", today: "2026-10-15", freezes: 0 }).streak).toBe(4);
    expect(nextStreak({ current: 3, lastActiveDate: "2026-10-15", today: "2026-10-15", freezes: 0 }).streak).toBe(3);
  });

  it("uses a freeze for one missed day", () => {
    expect(nextStreak({ current: 5, lastActiveDate: "2026-10-13", today: "2026-10-15", freezes: 1 })).toEqual({ streak: 6, freezes: 0, freezesUsed: 1, freezeEarned: false });
  });

  it("resets when there aren't enough freezes", () => {
    expect(nextStreak({ current: 9, lastActiveDate: "2026-10-11", today: "2026-10-15", freezes: 2 }).streak).toBe(1);
  });

  it("earns a freeze every 7 days, capped at 3", () => {
    expect(nextStreak({ current: 6, lastActiveDate: "2026-10-14", today: "2026-10-15", freezes: 0 })).toMatchObject({ streak: 7, freezes: 1, freezeEarned: true });
    expect(nextStreak({ current: 13, lastActiveDate: "2026-10-14", today: "2026-10-15", freezes: 3 })).toMatchObject({ streak: 14, freezes: 3, freezeEarned: false });
  });

  it("advances cleanly across 3 days in a row (Day 1 -> Day 2 -> Day 3)", () => {
    const day1 = nextStreak({ current: 0, lastActiveDate: null, today: "2026-11-11", freezes: 0 });
    expect(day1.streak).toBe(1);

    const day2 = nextStreak({ current: day1.streak, lastActiveDate: "2026-11-11", today: "2026-11-12", freezes: 0 });
    expect(day2.streak).toBe(2);

    const day3 = nextStreak({ current: day2.streak, lastActiveDate: "2026-11-12", today: "2026-11-13", freezes: 0 });
    expect(day3.streak).toBe(3);
  });

  it("handles ISO timestamps with time component gracefully without NaN errors", () => {
    expect(nextStreak({ current: 2, lastActiveDate: "2026-11-12T14:30:00.000Z", today: "2026-11-13T09:00:00.000Z", freezes: 0 }).streak).toBe(3);
    expect(nextStreak({ current: 2, lastActiveDate: "2026-11-13T08:00:00.000Z", today: "2026-11-13T10:00:00.000Z", freezes: 0 }).streak).toBe(2);
  });
});
