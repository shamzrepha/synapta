import { describe, it, expect } from "vitest";
import {
  buildPath,
  paceWeeks,
  nextBestActivity,
  KcPlanNode,
} from "./planner";

describe("Learning Map Planner Engine", () => {
  const sampleKcs: KcPlanNode[] = [
    { id: "kc1", title: "Ohm's Law", prerequisiteIds: [], order: 1, hasLab: true },
    { id: "kc2", title: "Resistor Networks", prerequisiteIds: ["kc1"], order: 2, hasLab: false },
    { id: "kc3", title: "RC Filters", prerequisiteIds: ["kc2"], order: 3, hasLab: true },
    { id: "kc4", title: "Semiconductors", prerequisiteIds: ["kc1"], order: 4, hasLab: false },
  ];

  it("selects next best activity according to latent BKT mastery probability", () => {
    expect(nextBestActivity({ pL: 0.15 })).toBe("learn");
    expect(nextBestActivity({ pL: 0.40 }, false)).toBe("practice_quiz");
    expect(nextBestActivity({ pL: 0.60 }, true)).toBe("lab");
    expect(nextBestActivity({ pL: 0.75 })).toBe("teach_back");
    expect(nextBestActivity({ pL: 0.95 })).toBe("review");
  });

  it("prioritizes unlocked concepts and excludes already mastered concepts", () => {
    const masteryMap = {
      kc1: 0.95, // Mastered -> should be excluded from active study path
      kc2: 0.50, // Unlocked (kc1 is 0.95 >= 0.70)
      kc3: 0.20, // Locked (kc2 is 0.50 < 0.70)
      kc4: 0.30, // Unlocked (kc1 is 0.95 >= 0.70)
    };

    const path = buildPath({ kcs: sampleKcs, masteryMap });

    expect(path.some((p) => p.kc.id === "kc1")).toBe(false); // kc1 excluded
    const kc2Item = path.find((p) => p.kc.id === "kc2");
    const kc3Item = path.find((p) => p.kc.id === "kc3");

    expect(kc2Item?.isUnlocked).toBe(true);
    expect(kc3Item?.isUnlocked).toBe(false);

    // Unlocked concepts appear ahead of locked concepts
    const kc2Index = path.findIndex((p) => p.kc.id === "kc2");
    const kc3Index = path.findIndex((p) => p.kc.id === "kc3");
    expect(kc2Index).toBeLessThan(kc3Index);
  });

  it("calculates accurate pacing and status against target date", () => {
    const today = new Date("2026-10-15T00:00:00Z");

    // Case 1: Healthy pace (10 topics across 4 weeks with 30 mins/day)
    const onTrack = paceWeeks({
      pathLength: 10,
      targetDate: "2026-11-15T00:00:00Z",
      minutesPerDay: 30,
      today,
    });
    expect(onTrack.status).toBe("on_track");
    expect(onTrack.kcsRemaining).toBe(10);

    // Case 2: Unrealistic crunch (12 topics due in 3 days)
    const behind = paceWeeks({
      pathLength: 12,
      targetDate: "2026-10-18T00:00:00Z",
      minutesPerDay: 20,
      today,
    });
    expect(behind.status).toBe("behind");

    // Case 3: Completed path
    const finished = paceWeeks({
      pathLength: 0,
      targetDate: "2026-11-01T00:00:00Z",
      today,
    });
    expect(finished.status).toBe("ahead");
  });
});
