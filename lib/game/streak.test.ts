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

  it("earns a freeze every 7 days, capped at 2", () => {
    expect(nextStreak({ current: 6, lastActiveDate: "2026-10-14", today: "2026-10-15", freezes: 0 })).toMatchObject({ streak: 7, freezes: 1, freezeEarned: true });
    expect(nextStreak({ current: 13, lastActiveDate: "2026-10-14", today: "2026-10-15", freezes: 2 })).toMatchObject({ streak: 14, freezes: 2, freezeEarned: false });
  });
});
