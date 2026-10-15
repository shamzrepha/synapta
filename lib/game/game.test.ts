import { describe, it, expect } from "vitest";
import { levelFromXp, xpForLevel } from "./levels";
import { leagueOutcome, weekIdFor, weekEndsAt, MAX_TIER } from "./leagues";
import { questsForDay, QUEST_POOL } from "./quests";
import { newlyEarnedBadges, EMPTY_STATS } from "./badges";

describe("levels", () => {
  it("follows the 50·n·(n−1) curve", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(5)).toBe(1000);
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(99).level).toBe(1);
    expect(levelFromXp(100).level).toBe(2);
    expect(levelFromXp(999).level).toBe(4);
    expect(levelFromXp(1000).level).toBe(5);
    expect(levelFromXp(4500).level).toBe(10);
  });

  it("reports progress within the level", () => {
    const l = levelFromXp(200); // level 2 spans 100..300
    expect(l.level).toBe(2);
    expect(l.progress).toBeCloseTo(0.5);
  });
});

describe("leagues", () => {
  it("promotes the top of a full cohort and demotes the bottom", () => {
    expect(leagueOutcome({ rank: 1, cohortSize: 30, tier: 0, xp: 500 })).toBe("promoted");
    expect(leagueOutcome({ rank: 7, cohortSize: 30, tier: 3, xp: 200 })).toBe("promoted");
    expect(leagueOutcome({ rank: 8, cohortSize: 30, tier: 3, xp: 200 })).toBe("stayed");
    expect(leagueOutcome({ rank: 30, cohortSize: 30, tier: 3, xp: 5 })).toBe("demoted");
  });

  it("never demotes from Bronze, never promotes past Diamond, and is gentle with small cohorts", () => {
    expect(leagueOutcome({ rank: 30, cohortSize: 30, tier: 0, xp: 1 })).toBe("stayed");
    expect(leagueOutcome({ rank: 1, cohortSize: 30, tier: MAX_TIER, xp: 999 })).toBe("stayed");
    expect(leagueOutcome({ rank: 5, cohortSize: 5, tier: 2, xp: 1 })).toBe("stayed");
    expect(leagueOutcome({ rank: 2, cohortSize: 3, tier: 0, xp: 10 })).toBe("stayed");
    expect(leagueOutcome({ rank: 1, cohortSize: 3, tier: 0, xp: 10 })).toBe("promoted");
  });

  it("does not promote someone with zero XP", () => {
    expect(leagueOutcome({ rank: 1, cohortSize: 1, tier: 0, xp: 0 })).toBe("stayed");
  });

  it("uses ISO weeks starting Monday UTC", () => {
    expect(weekIdFor(new Date("2026-10-12T00:00:00Z"))).toBe("2026-W42"); // Monday
    expect(weekIdFor(new Date("2026-10-18T23:59:59Z"))).toBe("2026-W42"); // Sunday
    expect(weekIdFor(new Date("2026-10-19T00:00:00Z"))).toBe("2026-W43");
    expect(weekEndsAt(new Date("2026-10-15T10:00:00Z")).toISOString()).toBe("2026-10-19T00:00:00.000Z");
  });
});

describe("daily quests", () => {
  it("gives 3 distinct quests, stable for the day, with one core learning quest", () => {
    const a = questsForDay("u1", "2026-10-15");
    expect(a).toHaveLength(3);
    expect(new Set(a.map((q) => q.metric)).size).toBe(3);
    expect(questsForDay("u1", "2026-10-15")).toEqual(a);
    expect(["quizCorrect", "quizAnswered", "xp", "labs"]).toContain(a[0].metric);
    expect(a.every((q) => QUEST_POOL.includes(q))).toBe(true);
  });

  it("varies between people and days", () => {
    const sets = new Set<string>();
    for (let i = 0; i < 20; i++) sets.add(questsForDay(`u${i}`, "2026-10-15").map((q) => q.id).join(","));
    expect(sets.size).toBeGreaterThan(3);
  });
});

describe("badges", () => {
  it("awards only badges not already owned", () => {
    const ctx = { stats: { ...EMPTY_STATS, evidence: 1, quizCorrect: 12 }, level: 1, streakDays: 3, leagueTier: 0 };
    const ids = newlyEarnedBadges(ctx, {}).map((b) => b.id);
    expect(ids).toEqual(expect.arrayContaining(["first_steps", "quiz_10", "streak_3"]));
    expect(newlyEarnedBadges(ctx, { first_steps: true, quiz_10: true, streak_3: true })).toHaveLength(0);
  });
});
