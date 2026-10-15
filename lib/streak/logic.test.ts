import { describe, it, expect } from "vitest";
import { recoveryCost, recoveryState, inferFrozenDays, buildCalendar, daysToNextFreeze, addDays } from "./logic";

describe("recovery", () => {
  it("is available only after exactly one missed day with no freezes", () => {
    const base = { streakDays: 10, freezes: 0, today: "2026-10-15" };
    expect(recoveryState({ ...base, lastActiveDate: "2026-10-13" }).available).toBe(true);
    expect(recoveryState({ ...base, lastActiveDate: "2026-10-14" }).available).toBe(false);
    expect(recoveryState({ ...base, lastActiveDate: "2026-10-12" }).available).toBe(false);
    expect(recoveryState({ ...base, freezes: 1, lastActiveDate: "2026-10-13" }).available).toBe(false);
    expect(recoveryState({ ...base, streakDays: 1, lastActiveDate: "2026-10-13" }).available).toBe(false);
  });
  it("expires at the end of today", () => {
    expect(recoveryState({ streakDays: 5, freezes: 0, today: "2026-10-15", lastActiveDate: "2026-10-13" }).expiresAt).toBe("2026-10-16T00:00:00.000Z");
  });
  it("prices within bounds", () => {
    expect(recoveryCost(0)).toBe(60);
    expect(recoveryCost(10)).toBe(140);
    expect(recoveryCost(1000)).toBe(400);
  });
});

describe("calendar", () => {
  it("marks frozen gaps inside the streak", () => {
    const active = new Set(["2026-10-10", "2026-10-11", "2026-10-13", "2026-10-14"]);
    // streak of 5 ending 10-14: 14, 13, (12 frozen), 11, 10
    const frozen = inferFrozenDays({ active, lastActiveDate: "2026-10-14", streakDays: 5, since: "2026-10-01" });
    expect([...frozen]).toEqual(["2026-10-12"]);
  });
  it("never marks days before data starts", () => {
    const frozen = inferFrozenDays({ active: new Set(["2026-10-14"]), lastActiveDate: "2026-10-14", streakDays: 20, since: "2026-10-13" });
    expect([...frozen]).toEqual(["2026-10-13"]);
  });
  it("builds 30 days ending today", () => {
    const cal = buildCalendar({ today: "2026-10-15", active: new Set(["2026-10-15"]), frozen: new Set(["2026-10-14"]) });
    expect(cal).toHaveLength(30);
    expect(cal[29]).toMatchObject({ date: "2026-10-15", status: "active", today: true });
    expect(cal[28].status).toBe("frozen");
    expect(cal[0].date).toBe(addDays("2026-10-15", -29));
  });
  it("counts days to next freeze", () => {
    expect(daysToNextFreeze(0)).toBe(7);
    expect(daysToNextFreeze(6)).toBe(1);
    expect(daysToNextFreeze(7)).toBe(7);
  });
});
