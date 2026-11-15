import { describe, it, expect } from "vitest";
import { applyTelemetryEvent, createDefaultTelemetryProfile } from "@/lib/learning/telemetry";
import { buildLearnerDna, pickAdaptiveQuizFocus, formatAdaptationDirective } from "./learner-dna";

describe("Personal Learner DNA engine", () => {
  it("builds a rich personalized directive from cohort, mastery, misconceptions, and weak formulas", () => {
    const telemetry = applyTelemetryEvent(createDefaultTelemetryProfile(), {
      questionId: "q-grav-1",
      topic: "Gravitation",
      formulas: ["F = G*m1*m2/r^2"],
      dwellMs: 180_000,
      peerMedianMs: 90_000,
      hintsUsed: 2,
      correct: false,
      scorePercent: 58,
    });
    const dna = buildLearnerDna({
      uid: "u1",
      userData: { learningLevel: "ss3" },
      telemetry: {
        ...telemetry,
        questionsStudied: 12,
        predictedExamReadiness: 58,
      },
      masteryDocs: [
        { kcId: "kc-grav", title: "Gravitation", pL: 0.34, attemptCount: 10, correctCount: 4 },
        { kcId: "kc-kin", title: "Kinematics", pL: 0.91, attemptCount: 8, correctCount: 8 },
      ],
      misconceptionDocs: [
        { label: "confuses_mass_with_weight", occurrences: 3, resolved: false },
        { label: "resolved_old_bug", occurrences: 2, resolved: true },
      ],
      mistakeDocs: [
        { topic: "Orbital radius squared", mastered: false },
      ],
    });

    expect(dna.paceProfile).toBe("deep_struggler");
    expect(dna.recommendedScaffold).toBe("socratic_micro_steps");
    expect(dna.strugglingTopics[0].title).toBe("Gravitation");
    expect(dna.masteredTopics[0].title).toBe("Kinematics");
    expect(dna.activeMisconceptions).toHaveLength(1);
    expect(dna.activeMisconceptions[0].label).toBe("confuses_mass_with_weight");
    expect(dna.adaptationDirective).toContain("<PERSONAL_LEARNER_DNA>");
    expect(dna.adaptationDirective).toContain("F = G*m1*m2/r^2");
    expect(dna.adaptationDirective).toContain("confuses_mass_with_weight");
    expect(pickAdaptiveQuizFocus(dna)).toBe("calculation");
  });

  it("detects fast rushers and honors explicit modality override", () => {
    const dna = buildLearnerDna({
      uid: "u2",
      preferredCohort: "visual_intuitive",
      telemetry: {
        dominantCohort: "first_principles",
        avgDwellRatio: 0.55,
        predictedExamReadiness: 61,
        questionsStudied: 8,
        weakFormulas: [],
        weakTopics: [],
        cohortWeights: { step_by_step_procedural: 0.2, visual_intuitive: 0.3, example_driven: 0.1, first_principles: 0.4 },
      },
      masteryDocs: [{ kcId: "k1", title: "Vectors", pL: 0.5, attemptCount: 6, correctCount: 3 }],
    });

    expect(dna.dominantCohort).toBe("visual_intuitive");
    expect(dna.paceProfile).toBe("fast_rusher");
    expect(dna.recommendedScaffold).toBe("socratic_micro_steps");
    expect(dna.adaptationDirective).toContain("pause-and-check");
    expect(formatAdaptationDirective(dna)).toContain("Visual & Real-World Analogy");
  });

  it("assigns stretch_challenge and application focus to high-mastery first-principles learners", () => {
    const dna = buildLearnerDna({
      uid: "u3",
      telemetry: {
        dominantCohort: "first_principles",
        avgDwellRatio: 0.9,
        predictedExamReadiness: 91,
        questionsStudied: 20,
        weakFormulas: [],
        weakTopics: [],
        cohortWeights: { step_by_step_procedural: 0.15, visual_intuitive: 0.2, example_driven: 0.15, first_principles: 0.5 },
      },
      masteryDocs: [{ kcId: "k1", title: "Thermodynamics", pL: 0.88, attemptCount: 15, correctCount: 14 }],
    });

    expect(dna.paceProfile).toBe("deliberate_steady");
    expect(dna.recommendedScaffold).toBe("stretch_challenge");
    expect(pickAdaptiveQuizFocus(dna)).toBe("application");
  });
});
