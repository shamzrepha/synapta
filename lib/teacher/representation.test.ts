import { describe, it, expect } from "vitest";
import {
  chooseRepresentation,
  updateRepresentationStats,
  RepresentationStatsMap,
} from "./representation";

describe("Measured Representation Bandit Engine", () => {
  it("honors explicit user preference without labeling", () => {
    const choice = chooseRepresentation({
      explicitPrefs: ["worked_example"],
      lastUsed: "analogy",
    });
    expect(choice).toBe("worked_example");
  });

  it("never repeats the representation that was just reported as not understood", () => {
    // If learner said "I don't get it" after analogy, analogy is forbidden
    const choice = chooseRepresentation({
      lastUsed: "analogy",
      randomValue: 0.1,
    });
    expect(choice).not.toBe("analogy");
  });

  it("exploits the highest measured learning gain format when well-sampled", () => {
    const stats: RepresentationStatsMap = {
      worked_example: { tries: 5, avgPLGain: 0.18 },
      analogy: { tries: 4, avgPLGain: 0.05 },
      step_by_step: { tries: 6, avgPLGain: 0.28 }, // best performer
      visual_diagram: { tries: 4, avgPLGain: 0.12 },
      plain_language: { tries: 5, avgPLGain: 0.08 },
      real_world_case: { tries: 3, avgPLGain: 0.10 },
      short_summary: { tries: 4, avgPLGain: 0.04 },
    };

    // randomValue = 0.50 (> epsilon 0.20, triggers exploitation)
    const choice = chooseRepresentation({
      stats,
      lastUsed: "worked_example",
      randomValue: 0.50,
    });

    expect(choice).toBe("step_by_step");
  });

  it("updates running average learning gains accurately", () => {
    let stats: RepresentationStatsMap = {};

    stats = updateRepresentationStats(stats, "worked_example", 0.10);
    expect(stats.worked_example.tries).toBe(1);
    expect(stats.worked_example.avgPLGain).toBe(0.10);

    stats = updateRepresentationStats(stats, "worked_example", 0.20);
    expect(stats.worked_example.tries).toBe(2);
    expect(stats.worked_example.avgPLGain).toBe(0.15);
  });
});
