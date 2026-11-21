import { describe, it, expect } from "vitest";
import { reminderCopy, shouldRemind } from "./reminder";

const base = { streakDays: 5, freezes: 0, points: 0, remindersOn: true, anchor: "2026-11-24", today: "2026-11-25", yesterday: "2026-11-24" };

describe("streak reminders", () => {
  it("targets learners with a live streak who have not qualified today", () => {
    expect(shouldRemind(base)).toBe(true);
    expect(shouldRemind({ ...base, points: 14 })).toBe(true);
  });
  it("skips learners who already qualified, opted out, have no streak, or whose streak is already broken", () => {
    expect(shouldRemind({ ...base, points: 30 })).toBe(false);
    expect(shouldRemind({ ...base, remindersOn: false })).toBe(false);
    expect(shouldRemind({ ...base, streakDays: 1 })).toBe(false);
    expect(shouldRemind({ ...base, anchor: "2026-11-22" })).toBe(false);
    expect(shouldRemind({ ...base, anchor: "2026-11-25" })).toBe(false);
  });
  it("words the reminder accurately", () => {
    expect(reminderCopy({ streakDays: 5, freezes: 0, points: 14 }).body).toContain("14/30 learning points");
    expect(reminderCopy({ streakDays: 5, freezes: 1, points: 0 }).body).toContain("freeze");
    expect(reminderCopy({ streakDays: 5, freezes: 0, points: 0 }).title).toContain("5-day streak");
  });
});
