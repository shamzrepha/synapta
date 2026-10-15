import { describe, it, expect } from "vitest";
import { activityLevel, buildGrid, summarize, monthLabels } from "./heatmap";

describe("activityLevel", () => {
  it("scales relative to the max", () => {
    expect(activityLevel(0, 10)).toBe(0);
    expect(activityLevel(1, 10)).toBe(1);
    expect(activityLevel(10, 10)).toBe(4);
    expect(activityLevel(5, 10)).toBe(2);
    expect(activityLevel(3, 3)).toBe(3);
  });
});

describe("buildGrid", () => {
  it("makes 52 columns of 7 days ending with today's week", () => {
    const grid = buildGrid("2026-10-15", { "2026-10-15": 4 });
    expect(grid).toHaveLength(52);
    expect(grid.every((c) => c.length === 7)).toBe(true);
    const flat = grid.flat();
    const today = flat.find((c) => c.date === "2026-10-15")!;
    expect(today).toMatchObject({ count: 4, level: 4, inRange: true });
    // 2026-10-15 is a Thursday: Fri/Sat of that week are in the future
    expect(flat.filter((c) => !c.inRange)).toHaveLength(2);
    expect(grid[0][0].date <= "2025-10-20").toBe(true);
  });
});

describe("summarize", () => {
  it("computes totals and streaks", () => {
    const counts = { "2026-10-10": 2, "2026-10-11": 1, "2026-10-12": 3, "2026-10-14": 1, "2026-10-15": 5 };
    expect(summarize(counts, "2026-10-15")).toEqual({ total: 12, activeDays: 5, currentStreak: 2, longestStreak: 3 });
  });
  it("keeps the current streak alive until the end of today", () => {
    expect(summarize({ "2026-10-14": 1, "2026-10-13": 1 }, "2026-10-15").currentStreak).toBe(2);
    expect(summarize({ "2026-10-12": 1 }, "2026-10-15").currentStreak).toBe(0);
  });
  it("handles empty data", () => {
    expect(summarize({}, "2026-10-15")).toEqual({ total: 0, activeDays: 0, currentStreak: 0, longestStreak: 0 });
  });
});

describe("monthLabels", () => {
  it("labels month starts without collisions", () => {
    const labels = monthLabels(buildGrid("2026-10-15", {}));
    expect(labels.length).toBeGreaterThanOrEqual(11);
    for (let i = 1; i < labels.length; i++) expect(labels[i].index - labels[i - 1].index).toBeGreaterThanOrEqual(3);
  });
});
