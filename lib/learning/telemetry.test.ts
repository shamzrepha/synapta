import { describe, it, expect } from "vitest";
import {
  computeDwellRatio,
  updatePeerMedianMs,
  applyTelemetryEvent,
  createDefaultTelemetryProfile,
  evaluateCohortHealth,
  pickNextRecommendedQuestion,
  LEARNING_COHORTS,
} from "./telemetry";

describe("TikTok/FYP Learning Telemetry, Completion Queue & Self-Healing Engine", () => {
  it("computes clamped dwell ratios relative to peer median", () => {
    expect(computeDwellRatio(90_000, 90_000)).toBe(1);
    expect(computeDwellRatio(180_000, 90_000)).toBe(2);
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
      dwellMs: 210_000,
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

  it("shifts fast learners who solve faster than peer median to first_principles cohort and tracks completion", () => {
    let profile = createDefaultTelemetryProfile();
    for (let i = 0; i < 4; i++) {
      profile = applyTelemetryEvent(profile, {
        questionId: `q-${i}`,
        topic: "Graph Traversal",
        dwellMs: 45_000,
        peerMedianMs: 90_000,
        hintsUsed: 0,
        correct: true,
        scorePercent: 95,
      });
    }

    expect(profile.dominantCohort).toBe("first_principles");
    expect(profile.completedQuestionIds).toContain("q-0");
    expect(profile.topicProgress["Graph Traversal"]?.completedCount).toBe(4);
    expect(profile.predictedExamReadiness).toBeGreaterThan(42);
    expect(LEARNING_COHORTS[profile.dominantCohort].shortLabel).toBe("First Principles");
  });

  it("flags low-clarity cohort explanations for self-healing when >35% request re-explanation", () => {
    expect(evaluateCohortHealth({ mastered: 5, reExplain: 1 }).needsHeal).toBe(false);
    expect(evaluateCohortHealth({ mastered: 1, reExplain: 3 }).needsHeal).toBe(true);
    expect(evaluateCohortHealth({ mastered: 1, reExplain: 3 }).clarityRate).toBe(25);
  });

  it("picks the next uncompleted question prioritizing weak topics", () => {
    const questions = [
      { id: "q1", topic: "Sorting" },
      { id: "q2", topic: "Graph Traversal" },
      { id: "q3", topic: "Dynamic Programming" },
    ];
    const next = pickNextRecommendedQuestion(questions, {
      completedQuestionIds: ["q1"],
      weakTopics: ["Dynamic Programming"],
    });
    expect(next?.id).toBe("q3");
  });
});

describe("telemetry profile stays small", () => {
  it("caps the per-topic history so a client cannot grow the user document without limit", () => {
    let profile = createDefaultTelemetryProfile();
    for (let i = 0; i < 400; i++) {
      profile = applyTelemetryEvent(profile, { questionId: `q${i}`, topic: `Topic ${i}`, dwellMs: 60_000, peerMedianMs: 90_000, correct: true, scorePercent: 90 });
    }
    expect(Object.keys(profile.topicProgress).length).toBeLessThanOrEqual(60);
    expect(profile.topicProgress["Topic 399"]).toBeDefined();
  });
});
