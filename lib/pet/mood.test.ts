import { describe, expect, it } from "vitest";
import { cleanPetName, petMood } from "./mood";

describe("petMood", () => {
  it("is sleepy after days away, whatever else is true", () => {
    expect(petMood({ streakDays: 9, daysAway: 3, avgMastery: 0.9 })).toBe("sleepy");
  });
  it("turns violet for high mastery with a streak, orange for a long streak, teal for a short one", () => {
    expect(petMood({ streakDays: 4, daysAway: 0, avgMastery: 0.85 })).toBe("genius");
    expect(petMood({ streakDays: 8, daysAway: 0, avgMastery: 0.4 })).toBe("fired");
    expect(petMood({ streakDays: 3, daysAway: 1, avgMastery: null })).toBe("happy");
    expect(petMood({ streakDays: 1, daysAway: 0, avgMastery: 0.2 })).toBe("calm");
  });
});

describe("cleanPetName", () => {
  it("keeps short plain text and falls back to Sprout", () => {
    expect(cleanPetName("  Bolt <b> ")).toBe("Bolt b");
    expect(cleanPetName("")).toBe("Sprout");
    expect(cleanPetName("x".repeat(40))).toHaveLength(16);
  });
});
