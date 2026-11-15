import { describe, it, expect } from "vitest";
import {
  computeDwellRatio,
  updatePeerMedianMs,
  applyTelemetryEvent,
  createDefaultTelemetryProfile,
  LEARNING_COHORTS,
} from "./telemetry";

describe("TikTok/FYP Learning Telemetry & Cohort Engine", () => {
  it("computes clamped dwell ratios relative to peer median", () => {
    expect(computeDwellRatio(90_000, 90_000)).toBe(1);
    expect(computeDwellRatio(180_000, 90_000)).toBe(2);
    // Clamps extreme tab-left-open durations to 600s max
    expect(computeDwellRatio(3_600_000, 150_000)).toBe(4);
  });

  it("updates rolling peer median smoothly with EWMA", () => {
    const res = updatePeerMedianMs(90_000, 4, 150_000);
    expect(res.sampleCount).toBe(5);
    expect(res.peerMedianMs).toBeGreaterThan(90_000);
    expect(res.peerMedianMs).toBeLessThan(150_000);
  });

  it("detects formula friction when dwell time exceeds peers and shifts cohort to step_by_step_procedural", () => {
    const initial = createDefaultTelemetryProfile();
    const updated = applyTelemetryEvent(initial, {
      questionId: "q1",
      topic: "Divide & Conquer Recurrences",
      formulas: ["T(n) = 2T(n/2) + O(n)", "Master Theorem: a >= 1, b > 1"],
      dwellMs: 210_000, // 210s vs 90s peer median -> 2.33x slower
      peerMedianMs: 90_000,
      hintsUsed: 2,
      correct: false,
    });

    expect(updated.dominantCohort).toBe("step_by_step_procedural");
    expect(updated.weakFormulas.length).toBe(2);
    expect(updated.weakFormulas[0].formula).toBe("T(n) = 2T(n/2) + O(n)");
    expect(updated.weakFormulas[0].frictionScore).toBeGreaterThanOrEqual(50);
    expect(updated.weakTopics).toContain("Divide & Conquer Recurrences");
    expect(updated.questionsStudied).toBe(1);
    expect(updated.studyMinutesTotal).toBe(3.5);
  });

  it("shifts fast learners who solve faster than peer median to first_principles cohort", () => {
    let profile = createDefaultTelemetryProfile();
    for (let i = 0; i < 4; i++) {
      profile = applyTelemetryEvent(profile, {
        questionId: `q-${i}`,
        topic: "Graph Traversal",
        dwellMs: 45_000, // 0.5x peer median
        peerMedianMs: 90_000,
        hintsUsed: 0,
        correct: true,
      });
    }

    expect(profile.dominantCohort).toBe("first_principles");
    expect(profile.predictedExamReadiness).toBeGreaterThan(42);
    expect(LEARNING_COHORTS[profile.dominantCohort].shortLabel).toBe("First Principles");
  });

  it("honors explicit cohort style switches from the student", () => {
    let profile = createDefaultTelemetryProfile();
    profile = applyTelemetryEvent(profile, {
      questionId: "q2",
      topic: "Dynamic Programming",
      dwellMs: 120_000,
      peerMedianMs: 90_000,
      preferredCohort: "visual_intuitive",
    });
    profile = applyTelemetryEvent(profile, {
      questionId: "q3",
      topic: "Dynamic Programming",
      dwellMs: 110_000,
      peerMedianMs: 90_000,
      preferredCohort: "visual_intuitive",
    });

    expect(profile.dominantCohort).toBe("visual_intuitive");
  });
});
