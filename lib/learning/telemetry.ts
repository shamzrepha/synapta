/**
 * TikTok / FYP-Style Personal Learning Telemetry & Cohort Caching Engine.
 *
 * Tracks per-question dwell time vs. class peers, formula/topic friction,
 * and engagement signals to:
 *  1. Assign each student to one of 4 Learning Style & Struggle Cohorts
 *     so personalized explanations can be pre-stored once per cohort and
 *     served to thousands of matching students at $0 marginal AI token cost.
 *  2. Identify specific formulas and topics causing friction for the student.
 *  3. Predict improvement velocity and exam readiness trajectory.
 */

export type LearningCohortId =
  | "step_by_step_procedural"
  | "visual_intuitive"
  | "example_driven"
  | "first_principles";

export interface CohortDescriptor {
  id: LearningCohortId;
  label: string;
  shortLabel: string;
  description: string;
  aiPromptDirective: string;
}

export const LEARNING_COHORTS: Record<LearningCohortId, CohortDescriptor> = {
  step_by_step_procedural: {
    id: "step_by_step_procedural",
    label: "Micro-Step Formula Breakdown",
    shortLabel: "Micro-Steps",
    description:
      "Unpacks every algebraic substitution and formula rearrangement line-by-line with zero skipped steps.",
    aiPromptDirective:
      "COHORT STYLE: Micro-Step Procedural. Do NOT skip any intermediate algebraic or logical step. State the exact formula variable-by-variable, show the raw substitution with units, and explain why each rearrangement happens.",
  },
  visual_intuitive: {
    id: "visual_intuitive",
    label: "Visual & Real-World Analogy",
    shortLabel: "Visual Analogy",
    description:
      "Builds a physical mental model and intuitive everyday analogy before introducing mathematical notation.",
    aiPromptDirective:
      "COHORT STYLE: Visual & Intuitive. Begin the keyPrinciple and each step with a concrete physical mental model or everyday campus/engineering analogy so the student visualizes what is happening before seeing equations.",
  },
  example_driven: {
    id: "example_driven",
    label: "Worked Number Pattern-Matching",
    shortLabel: "Worked Examples",
    description:
      "Pairs abstract rules with concrete side-by-side numerical examples so you can see the pattern immediately.",
    aiPromptDirective:
      "COHORT STYLE: Example-Driven. Alongside any general theorem or recurrence, immediately show a concrete small-number trace (e.g. n=3 or a 4-element trace) so the student sees the exact pattern in action.",
  },
  first_principles: {
    id: "first_principles",
    label: "First-Principles & Examiner Edge Cases",
    shortLabel: "First Principles",
    description:
      "Fast-paced derivation from axioms, focusing on boundary conditions, proofs, and tricky lecturer twists.",
    aiPromptDirective:
      "COHORT STYLE: First-Principles & Edge Cases. Keep basic arithmetic concise; focus deeply on rigorous proof justification, boundary/base cases, complexity bounds, and subtle lecturer twists that separate an A from a B.",
  },
};

export const COHORT_IDS: LearningCohortId[] = [
  "step_by_step_procedural",
  "visual_intuitive",
  "example_driven",
  "first_principles",
];

export interface TelemetryEventInput {
  questionId: string;
  classId?: string;
  topic?: string;
  formulas?: string[];
  /** Time spent actively studying/solving the question in milliseconds */
  dwellMs: number;
  /** Peer median dwell time on this question in milliseconds (default 90_000ms = 90s) */
  peerMedianMs?: number;
  /** Number of hints revealed or 'explain differently' clicks */
  hintsUsed?: number;
  /** Did the student get the self-check / twin practice right? */
  correct?: boolean;
  /** Explicit cohort style the student switched to or liked */
  preferredCohort?: LearningCohortId;
}

export interface FormulaStruggleEntry {
  formula: string;
  topic: string;
  frictionScore: number; // 0 to 100
  encounters: number;
  avgDwellRatio: number;
}

export interface LearnerTelemetryProfile {
  dominantCohort: LearningCohortId;
  cohortWeights: Record<LearningCohortId, number>;
  studyMinutesTotal: number;
  questionsStudied: number;
  avgDwellRatio: number;
  weakFormulas: FormulaStruggleEntry[];
  weakTopics: string[];
  predictedExamReadiness: number; // 0 to 100
  predictedWeeklyGain: number; // percentage points per week at current pace
}

export const DEFAULT_PEER_MEDIAN_MS = 90_000; // 1.5 minutes baseline per past question

export function createDefaultTelemetryProfile(): LearnerTelemetryProfile {
  return {
    dominantCohort: "step_by_step_procedural",
    cohortWeights: {
      step_by_step_procedural: 35,
      visual_intuitive: 25,
      example_driven: 25,
      first_principles: 15,
    },
    studyMinutesTotal: 0,
    questionsStudied: 0,
    avgDwellRatio: 1.0,
    weakFormulas: [],
    weakTopics: [],
    predictedExamReadiness: 42,
    predictedWeeklyGain: 8,
  };
}

/**
 * Computes the ratio of a user's dwell time to the peer median, clamped to [0.2, 4.0]
 * so extreme outliers (e.g. leaving a tab open) don't skew the algorithm.
 */
export function computeDwellRatio(dwellMs: number, peerMedianMs = DEFAULT_PEER_MEDIAN_MS): number {
  const safeDwell = Math.max(3_000, Math.min(dwellMs, 600_000)); // clamp 3s .. 10m
  const safePeer = Math.max(15_000, Math.min(peerMedianMs, 300_000));
  return Number((safeDwell / safePeer).toFixed(2));
}

/**
 * Updates rolling peer median dwell time when a new student completes a question.
 */
export function updatePeerMedianMs(
  currentMedianMs: number | undefined,
  sampleCount: number | undefined,
  newDwellMs: number
): { peerMedianMs: number; sampleCount: number } {
  const clamped = Math.max(10_000, Math.min(newDwellMs, 360_000));
  const prevMedian = currentMedianMs && currentMedianMs > 0 ? currentMedianMs : DEFAULT_PEER_MEDIAN_MS;
  const count = sampleCount && sampleCount > 0 ? sampleCount : 1;
  // Exponentially weighted moving average so recent class cohorts stabilize quickly
  const alpha = Math.max(0.08, 1 / (count + 2));
  const nextMedian = Math.round(prevMedian * (1 - alpha) + clamped * alpha);
  return {
    peerMedianMs: nextMedian,
    sampleCount: count + 1,
  };
}

/**
 * Pure reducer that ingests a new TelemetryEventInput and updates the LearnerTelemetryProfile
 * (just like TikTok's watch-time & affinity algorithm).
 */
export function applyTelemetryEvent(
  prev: Partial<LearnerTelemetryProfile> | undefined,
  event: TelemetryEventInput
): LearnerTelemetryProfile {
  const base = {
    ...createDefaultTelemetryProfile(),
    ...prev,
    cohortWeights: {
      ...createDefaultTelemetryProfile().cohortWeights,
      ...(prev?.cohortWeights || {}),
    },
    weakFormulas: [...(prev?.weakFormulas || [])],
    weakTopics: [...(prev?.weakTopics || [])],
  };

  const dwellRatio = computeDwellRatio(event.dwellMs, event.peerMedianMs);
  const hints = event.hintsUsed ?? 0;
  const hasFormulas = Boolean(event.formulas && event.formulas.length > 0);
  const isStruggling = dwellRatio > 1.3 || hints >= 2 || event.correct === false;
  const isFastMastery = dwellRatio < 0.85 && hints === 0 && event.correct !== false;

  // 1. Update Cohort Affinity Weights
  const weights = { ...base.cohortWeights };

  if (event.preferredCohort && LEARNING_COHORTS[event.preferredCohort]) {
    // Explicit user preference signal carries strong weight
    weights[event.preferredCohort] += 18;
  } else if (isFastMastery) {
    weights.first_principles += 10;
  } else if (isStruggling && hasFormulas) {
    // High dwell time on formula-heavy question -> boost step-by-step & example-driven
    weights.step_by_step_procedural += 10;
    weights.example_driven += 6;
  } else if (isStruggling && !hasFormulas) {
    // High dwell time on conceptual/theory question -> boost visual analogy
    weights.visual_intuitive += 10;
    weights.example_driven += 4;
  } else if (dwellRatio >= 1.05 && dwellRatio <= 1.3) {
    weights.example_driven += 6;
  }

  // Normalize weights to sum to 100
  const totalWeight =
    weights.step_by_step_procedural +
    weights.visual_intuitive +
    weights.example_driven +
    weights.first_principles;

  if (totalWeight > 0) {
    for (const key of COHORT_IDS) {
      weights[key] = Math.max(5, Math.round((weights[key] / totalWeight) * 100));
    }
  }

  // Determine dominant cohort
  let dominantCohort: LearningCohortId = base.dominantCohort;
  let maxScore = -1;
  for (const key of COHORT_IDS) {
    if (weights[key] > maxScore) {
      maxScore = weights[key];
      dominantCohort = key;
    }
  }

  // 2. Update Formula & Topic Friction
  const topicLabel = (event.topic || "General Syllabus").trim();
  const formulaList = (event.formulas || []).map((f) => f.trim()).filter(Boolean);

  // Calculate friction delta for this encounter (0..100)
  const encounterFriction = Math.min(
    100,
    Math.round(
      Math.max(0, (dwellRatio - 0.7) * 45) +
        hints * 18 +
        (event.correct === false ? 30 : event.correct === true ? -15 : 0)
    )
  );

  const formulaMap = new Map<string, FormulaStruggleEntry>();
  for (const item of base.weakFormulas) {
    formulaMap.set(item.formula, { ...item });
  }

  for (const f of formulaList) {
    const existing = formulaMap.get(f);
    if (existing) {
      const nextEncounters = existing.encounters + 1;
      const nextFriction = Math.max(
        0,
        Math.min(100, Math.round(existing.frictionScore * 0.65 + encounterFriction * 0.35))
      );
      const nextDwell = Number(((existing.avgDwellRatio * existing.encounters + dwellRatio) / nextEncounters).toFixed(2));
      formulaMap.set(f, {
        formula: f,
        topic: topicLabel || existing.topic,
        frictionScore: nextFriction,
        encounters: nextEncounters,
        avgDwellRatio: nextDwell,
      });
    } else if (encounterFriction >= 35) {
      formulaMap.set(f, {
        formula: f,
        topic: topicLabel,
        frictionScore: encounterFriction,
        encounters: 1,
        avgDwellRatio: dwellRatio,
      });
    }
  }

  const weakFormulas = Array.from(formulaMap.values())
    .filter((x) => x.frictionScore >= 30)
    .sort((a, b) => b.frictionScore - a.frictionScore)
    .slice(0, 8);

  const weakTopicsSet = new Set(base.weakTopics);
  if (isStruggling && topicLabel) {
    weakTopicsSet.add(topicLabel);
  } else if (isFastMastery && topicLabel) {
    weakTopicsSet.delete(topicLabel);
  }
  const weakTopics = Array.from(weakTopicsSet).slice(0, 6);

  // 3. Update Study Time, Rolling Dwell Ratio & Predicted Improvement
  const addedMinutes = Math.max(0.5, Number((Math.min(event.dwellMs, 600_000) / 60_000).toFixed(1)));
  const studyMinutesTotal = Number((base.studyMinutesTotal + addedMinutes).toFixed(1));
  const questionsStudied = base.questionsStudied + 1;
  const avgDwellRatio = Number(
    ((base.avgDwellRatio * base.questionsStudied + dwellRatio) / questionsStudied).toFixed(2)
  );

  // Readiness increases with questions studied and accuracy, tempered by unresolved formula friction
  const accuracyBonus = event.correct === true ? 3.2 : event.correct === false ? 0.6 : 1.8;
  const frictionPenalty = weakFormulas.length * 0.4;
  const rawReadiness = Math.min(
    98,
    Math.max(25, Math.round(base.predictedExamReadiness + accuracyBonus - (isStruggling ? 0.5 : 0)))
  );
  const predictedExamReadiness = Math.max(25, Math.min(98, Math.round(rawReadiness - frictionPenalty * 0.15)));

  // Weekly gain prediction based on engagement velocity
  const predictedWeeklyGain = Math.min(
    25,
    Math.max(4, Math.round(6 + Math.min(questionsStudied, 15) * 0.8 + (1.2 / Math.max(0.6, avgDwellRatio)) * 3))
  );

  return {
    dominantCohort,
    cohortWeights: weights,
    studyMinutesTotal,
    questionsStudied,
    avgDwellRatio,
    weakFormulas,
    weakTopics,
    predictedExamReadiness,
    predictedWeeklyGain,
  };
}
