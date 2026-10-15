import { describe, it, expect } from "vitest";
import { computeStreak, dayId } from "./days";

describe("computeStreak", () => {
  it("counts consecutive days ending today", () => {
    expect(computeStreak(["2026-05-01", "2026-05-02", "2026-05-03"], "2026-05-03")).toEqual({ current: 3, longest: 3, activeToday: true });
  });
  it("keeps the streak alive through yesterday", () => {
    const r = computeStreak(["2026-05-01", "2026-05-02"], "2026-05-03");
    expect(r.current).toBe(2);
    expect(r.activeToday).toBe(false);
  });
  it("breaks after a missed day but remembers longest", () => {
    const r = computeStreak(["2026-04-01", "2026-04-02", "2026-04-03", "2026-05-02"], "2026-05-03");
    expect(r.current).toBe(1);
    expect(r.longest).toBe(3);
  });
  it("is zero when nothing recent", () => {
    expect(computeStreak(["2026-01-01"], "2026-05-03").current).toBe(0);
    expect(computeStreak([], "2026-05-03")).toEqual({ current: 0, longest: 0, activeToday: false });
  });
  it("crosses month boundaries", () => {
    expect(computeStreak(["2026-02-28", "2026-03-01"], "2026-03-01").current).toBe(2);
    expect(computeStreak(["2026-02-27", "2026-02-28", "2026-03-01"], "2026-03-01").current).toBe(3);
    expect(dayId(Date.parse("2026-03-01T12:00:00Z"))).toBe("2026-03-01");
  });
});
