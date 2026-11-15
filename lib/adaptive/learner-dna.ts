import {
  applyTelemetryEvent,
  createDefaultTelemetryProfile,
  LEARNING_COHORTS,
  type LearningCohortId,
  type LearnerTelemetryProfile,
} from "@/lib/learning/telemetry";

export type PaceProfile = "fast_rusher" | "deliberate_steady" | "deep_struggler";

export type RecommendedScaffold =
  | "socratic_micro_steps"
  | "worked_example_first"
  | "visual_simulation_first"
  | "stretch_challenge";

export interface TopicMasteryBrief {
  kcId: string;
  title: string;
  pL: number;
}

export interface ActiveMisconceptionBrief {
  label: string;
  occurrences: number;
  description?: string;
}

export interface LearnerDna {
  uid: string;
  dominantCohort: LearningCohortId;
  cohortLabel: string;
  cohortSummary: string;
  preferredModalityOverride: LearningCohortId | null;
  paceProfile: PaceProfile;
  recommendedScaffold: RecommendedScaffold;
  learningLevel: string;
  averageMastery: number;
  accuracyRate: number;
  predictedReadiness: number;
  avgDwellRatio: number;
  totalSignals: number;
  masteredTopics: TopicMasteryBrief[];
  strugglingTopics: TopicMasteryBrief[];
  weakFormulas: Array<{ formula: string; frictionScore: number }>;
  activeMisconceptions: ActiveMisconceptionBrief[];
  recentMistakeTopics: string[];
  adaptationDirective: string;
  updatedAtMs: number;
}

export interface BuildLearnerDnaInput {
  uid: string;
  userData?: Record<string, unknown> | null;
  telemetry?: Partial<LearnerTelemetryProfile> | null;
  preferredCohort?: LearningCohortId | null;
  masteryDocs?: Array<{ kcId?: string; title?: string; topic?: string; pL?: number; correctCount?: number; attemptCount?: number }>;
  misconceptionDocs?: Array<{ label?: string; description?: string; occurrences?: number; resolved?: boolean }>;
  mistakeDocs?: Array<{ topic?: string; question?: string; mastered?: boolean }>;
  nowMs?: number;
}

function clampPct(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function cleanText(raw: unknown, max = 90): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, max);
}

export function isValidCohortId(v: unknown): v is LearningCohortId {
  return typeof v === "string" && v in LEARNING_COHORTS;
}

export function inferPaceProfile(opts: {
  avgDwellRatio: number;
  accuracyRate: number;
  averageMastery: number;
  totalSignals: number;
}): PaceProfile {
  if (opts.totalSignals < 2) return "deliberate_steady";
  if (opts.avgDwellRatio > 0 && opts.avgDwellRatio < 0.72 && opts.accuracyRate < 0.65) {
    return "fast_rusher";
  }
  if (opts.avgDwellRatio > 1.35 || (opts.averageMastery > 0 && opts.averageMastery < 42) || opts.accuracyRate < 0.5) {
    return "deep_struggler";
  }
  return "deliberate_steady";
}

export function inferRecommendedScaffold(opts: {
  cohort: LearningCohortId;
  pace: PaceProfile;
  averageMastery: number;
  activeMisconceptionsCount: number;
}): RecommendedScaffold {
  if (
    opts.pace === "fast_rusher" ||
    opts.activeMisconceptionsCount >= 2 ||
    opts.averageMastery < 40 ||
    (opts.pace === "deep_struggler" && opts.activeMisconceptionsCount >= 1)
  ) {
    return "socratic_micro_steps";
  }
  if (opts.averageMastery >= 82 && opts.cohort === "first_principles") {
    return "stretch_challenge";
  }
  if (opts.cohort === "visual_intuitive") {
    return "visual_simulation_first";
  }
  if (opts.cohort === "example_driven" || opts.cohort === "step_by_step_procedural") {
    return "worked_example_first";
  }
  return "stretch_challenge";
}

export function formatAdaptationDirective(dna: Omit<LearnerDna, "adaptationDirective">): string {
  const scaffoldInstructions: Record<RecommendedScaffold, string> = {
    socratic_micro_steps: "Break concepts into 1-2 micro-steps with quick verification checks before moving forward.",
    worked_example_first: "Lead with one concrete solved numeric/real-world example before formal notation.",
    visual_simulation_first: "Anchor intuition in spatial mental imagery, physical setups, and cause-effect visuals.",
    stretch_challenge: "Skip trivial basics; challenge with edge cases, transfer problems, and inverse questions.",
  };
  const paceInstructions: Record<PaceProfile, string> = {
    fast_rusher: "Learner answers quickly with slips — ask brief pause-and-check questions and catch sign/unit errors early.",
    deep_struggler: "Learner benefits from lower cognitive load — build confidence with relatable analogies first.",
    deliberate_steady: "Keep crisp steady rigor with active recall checkpoints.",
  };

  const lines: string[] = [
    "<PERSONAL_LEARNER_DNA>",
    `Learner Level: ${dna.learningLevel || "general"} | Cohort Mode: ${dna.cohortLabel} | Pace: ${dna.paceProfile.replace(/_/g, " ")}`,
    `Metrics: Mastery ${dna.averageMastery}% · Accuracy ${Math.round(dna.accuracyRate * 100)}% · Exam Readiness ${dna.predictedReadiness}% (${dna.totalSignals} tracked signals)`,
    `Coaching Directive: ${scaffoldInstructions[dna.recommendedScaffold]} ${paceInstructions[dna.paceProfile]}`,
  ];

  if (dna.activeMisconceptions.length > 0) {
    const items = dna.activeMisconceptions.slice(0, 3).map((m) => `${m.label} (${m.occurrences}x)`).join("; ");
    lines.push(`Active Misconceptions to Repair: ${items}`);
  }
  if (dna.weakFormulas.length > 0) {
    const formulas = dna.weakFormulas.slice(0, 3).map((f) => f.formula).join("; ");
    lines.push(`Friction Formulas: ${formulas}`);
  }
  if (dna.strugglingTopics.length > 0) {
    const weak = dna.strugglingTopics.slice(0, 4).map((t) => `${t.title} (${t.pL}%)`).join(", ");
    lines.push(`Priority Weak Topics: ${weak}`);
  }
  if (dna.masteredTopics.length > 0) {
    const strong = dna.masteredTopics.slice(0, 3).map((t) => `${t.title} (${t.pL}%)`).join(", ");
    lines.push(`Already Mastered (build on these as bridges): ${strong}`);
  }
  if (dna.recentMistakeTopics.length > 0) {
    lines.push(`Recent Mistake Patterns: ${dna.recentMistakeTopics.slice(0, 3).join("; ")}`);
  }
  lines.push("</PERSONAL_LEARNER_DNA>");

  return lines.join("\n").slice(0, 1100);
}

/**
 * Pure deterministic synthesizer turning unified learner signals (telemetry cohorts,
 * BKT mastery, unresolved misconceptions, and mistake history) into an actionable LearnerDna.
 */
export function buildLearnerDna(input: BuildLearnerDnaInput): LearnerDna {
  const defaults = createDefaultTelemetryProfile();
  const rawTelemetry = (input.telemetry || (input.userData?.telemetryProfile as Partial<LearnerTelemetryProfile> | undefined) || {}) as Partial<LearnerTelemetryProfile>;
  const telemetry: LearnerTelemetryProfile = {
    ...defaults,
    ...rawTelemetry,
    cohortWeights: {
      ...defaults.cohortWeights,
      ...(rawTelemetry.cohortWeights || {}),
    },
    weakFormulas: Array.isArray(rawTelemetry.weakFormulas) ? rawTelemetry.weakFormulas : defaults.weakFormulas,
    weakTopics: Array.isArray(rawTelemetry.weakTopics) ? rawTelemetry.weakTopics : defaults.weakTopics,
  };

  const rawOverride = input.preferredCohort ?? (input.userData?.preferredCohort as unknown);
  const preferredModalityOverride = isValidCohortId(rawOverride) ? rawOverride : null;

  const dominantCohort: LearningCohortId =
    preferredModalityOverride ||
    (isValidCohortId(telemetry.dominantCohort) ? telemetry.dominantCohort : "visual_intuitive");
  const cohortMeta = LEARNING_COHORTS[dominantCohort];

  // Mastery breakdown
  const normalizedMastery: TopicMasteryBrief[] = (input.masteryDocs || [])
    .map((m) => {
      const pLRaw = typeof m.pL === "number" ? m.pL : 0.1;
      const pLPct = pLRaw <= 1 ? pLRaw * 100 : pLRaw;
      return {
        kcId: cleanText(m.kcId || "", 60) || "topic",
        title: cleanText(m.title || m.topic || m.kcId || "Topic", 70) || "Topic",
        pL: clampPct(pLPct),
      };
    })
    .filter((t) => Boolean(t.title));

  const masterySorted = [...normalizedMastery].sort((a, b) => a.pL - b.pL);
  const strugglingTopics = masterySorted.filter((t) => t.pL < 70).slice(0, 5);
  for (const wt of telemetry.weakTopics) {
    const clean = cleanText(wt, 70);
    if (clean && !strugglingTopics.some((t) => t.title.toLowerCase() === clean.toLowerCase())) {
      strugglingTopics.push({ kcId: clean.toLowerCase().replace(/\s+/g, "_"), title: clean, pL: 35 });
    }
  }
  const masteredTopics = [...normalizedMastery]
    .filter((t) => t.pL >= 80)
    .sort((a, b) => b.pL - a.pL)
    .slice(0, 5);

  const averageMastery = normalizedMastery.length
    ? clampPct(normalizedMastery.reduce((sum, m) => sum + m.pL, 0) / normalizedMastery.length)
    : clampPct(telemetry.predictedExamReadiness || 40);

  // Compute accuracy from mastery attempt/correct sums + mistakes/telemetry fallback
  let attempts = 0;
  let corrects = 0;
  for (const m of input.masteryDocs || []) {
    if (typeof m.attemptCount === "number" && m.attemptCount > 0) {
      attempts += m.attemptCount;
      corrects += Math.min(m.attemptCount, typeof m.correctCount === "number" ? m.correctCount : 0);
    }
  }
  const totalSignals = Math.max(attempts, telemetry.questionsStudied || 0);
  const accuracyRate = attempts > 0
    ? Number((corrects / attempts).toFixed(2))
    : Math.max(0.2, Math.min(0.95, Number(((telemetry.predictedExamReadiness || 55) / 100).toFixed(2))));

  const activeMisconceptions: ActiveMisconceptionBrief[] = (input.misconceptionDocs || [])
    .filter((m) => !m.resolved && typeof m.label === "string" && m.label.trim() && m.label !== "general_kc_accuracy")
    .sort((a, b) => (b.occurrences || 1) - (a.occurrences || 1))
    .slice(0, 5)
    .map((m) => ({
      label: cleanText(m.label, 80),
      occurrences: Math.max(1, Number(m.occurrences || 1)),
      description: cleanText(m.description, 120) || undefined,
    }));

  const recentMistakeTopics = Array.from(
    new Set(
      (input.mistakeDocs || [])
        .filter((m) => !m.mastered)
        .map((m) => cleanText(m.topic || m.question || "", 70))
        .filter(Boolean)
    )
  ).slice(0, 4);

  const weakFormulas = (telemetry.weakFormulas || [])
    .slice()
    .sort((a, b) => (b.frictionScore || 0) - (a.frictionScore || 0))
    .slice(0, 6)
    .map((f) => ({ formula: cleanText(f.formula, 90), frictionScore: clampPct(f.frictionScore || 0) }))
    .filter((f) => Boolean(f.formula));

  const avgDwellRatio = Number((telemetry.avgDwellRatio || 1).toFixed(2));
  const paceProfile = inferPaceProfile({
    avgDwellRatio,
    accuracyRate,
    averageMastery,
    totalSignals,
  });
  const recommendedScaffold = inferRecommendedScaffold({
    cohort: dominantCohort,
    pace: paceProfile,
    averageMastery,
    activeMisconceptionsCount: activeMisconceptions.length,
  });

  const learningLevel =
    cleanText(input.userData?.learningLevel || input.userData?.educationLevel || "general", 40) || "general";

  const base: Omit<LearnerDna, "adaptationDirective"> = {
    uid: input.uid,
    dominantCohort,
    cohortLabel: cohortMeta.label,
    cohortSummary: cohortMeta.shortLabel,
    preferredModalityOverride,
    paceProfile,
    recommendedScaffold,
    learningLevel,
    averageMastery,
    accuracyRate,
    predictedReadiness: clampPct(telemetry.predictedExamReadiness ?? averageMastery),
    avgDwellRatio,
    totalSignals,
    masteredTopics: masteredTopics.slice(0, 5),
    strugglingTopics: strugglingTopics.slice(0, 5),
    weakFormulas,
    activeMisconceptions,
    recentMistakeTopics,
    updatedAtMs: input.nowMs ?? Date.now(),
  };

  return {
    ...base,
    adaptationDirective: formatAdaptationDirective(base),
  };
}

/** Suggests which quiz question focus matches the learner's real gaps right now. */
export function pickAdaptiveQuizFocus(dna: LearnerDna): "calculation" | "conceptual" | "application" | null {
  if (dna.weakFormulas.length > 0) return "calculation";
  if (dna.activeMisconceptions.length > 0 || dna.averageMastery < 55) return "conceptual";
  if (dna.averageMastery >= 75) return "application";
  return null;
}

const DNA_CACHE_TTL_MS = 90_000;
const dnaCache = new Map<string, { dna: LearnerDna; expiresAt: number }>();

export function invalidateLearnerDnaCache(uid: string): void {
  if (uid) dnaCache.delete(uid);
}

/**
 * Loads unified Learner DNA from Firestore (users + mastery + misconceptions + mistakes) with short TTL cache.
 * Defensive against partial mocks in unit tests or missing fields.
 */
export async function loadLearnerDna(uid: string, opts?: { forceFresh?: boolean }): Promise<LearnerDna | null> {
  if (!uid) return null;
  const now = Date.now();
  if (!opts?.forceFresh) {
    const cached = dnaCache.get(uid);
    if (cached && cached.expiresAt > now) return cached.dna;
  }

  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const db = adminDb();
    if (!db || typeof db.collection !== "function") return null;

    const userPromise = db.collection("users").doc(uid).get().catch(() => null);
    const masteryPromise = db.collection("mastery").where("uid", "==", uid).limit(25).get().catch(() => null);
    const misconceptionPromise = db.collection("misconceptions").where("uid", "==", uid).limit(25).get().catch(() => null);
    const mistakePromise = db.collection("mistakes").where("uid", "==", uid).limit(12).get().catch(() => null);

    const [userSnap, masterySnap, misSnap, mistakeSnap] = await Promise.all([
      userPromise,
      masteryPromise,
      misconceptionPromise,
      mistakePromise,
    ]);

    const userData = userSnap?.exists ? (userSnap.data() as Record<string, unknown>) : null;
    const masteryDocs = (masterySnap?.docs || []).map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        kcId: String(data.kcId || d.id),
        title: typeof data.kcTitle === "string" ? data.kcTitle : typeof data.topic === "string" ? data.topic : undefined,
        pL: typeof data.pL === "number" ? data.pL : 0.1,
        correctCount: typeof data.correctCount === "number" ? data.correctCount : 0,
        attemptCount: typeof data.attemptCount === "number" ? data.attemptCount : 0,
      };
    });
    const misconceptionDocs = (misSnap?.docs || []).map((d) => d.data() as Record<string, unknown>);
    const mistakeDocs = (mistakeSnap?.docs || []).map((d) => d.data() as Record<string, unknown>);

    const dna = buildLearnerDna({
      uid,
      userData,
      telemetry: (userData?.telemetryProfile as Partial<LearnerTelemetryProfile> | undefined) || null,
      masteryDocs,
      misconceptionDocs,
      mistakeDocs,
      nowMs: now,
    });

    dnaCache.set(uid, { dna, expiresAt: now + DNA_CACHE_TTL_MS });
    return dna;
  } catch {
    return null;
  }
}

export async function buildLearnerPromptInjection(
  uid: string,
  context?: { topicTitle?: string }
): Promise<string | null> {
  const dna = await loadLearnerDna(uid);
  if (!dna) return null;
  // Wait until there's at least 1 signal OR explicit modality preference, OR even baseline level metadata
  if (dna.totalSignals === 0 && !dna.preferredModalityOverride && dna.activeMisconceptions.length === 0 && !dna.strugglingTopics.length) {
    return null;
  }
  const extra = context?.topicTitle ? `\nActive Topic Focus: ${cleanText(context.topicTitle, 80)}` : "";
  return `${dna.adaptationDirective}${extra}`;
}

export interface AdaptiveSignalInput {
  uid: string;
  classId?: string;
  kcId?: string;
  topic?: string;
  questionId?: string;
  correct?: boolean;
  scorePercent?: number;
  dwellMs?: number;
  peerMedianMs?: number;
  hintsUsed?: number;
  activity?: string;
  formulas?: string[];
}

/**
 * Records a learning telemetry event onto `users/{uid}.telemetryProfile` across ALL activities
 * (quizzes, labs, sims, studio, Tutor hints, CBT/handwritten practice) and invalidates cached DNA.
 * Always best-effort; never throws so primary assessment flows remain rock-solid.
 */
export async function recordAdaptiveSignal(input: AdaptiveSignalInput): Promise<void> {
  if (!input.uid) return;
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    const db = adminDb();
    if (!db || typeof db.collection !== "function") return;

    const userRef = db.collection("users").doc(input.uid);
    const snap = await userRef.get().catch(() => null);
    if (!snap || !snap.exists) return;

    let topicTitle = cleanText(input.topic, 80);
    if (!topicTitle && input.classId && input.kcId) {
      const kcSnap = await db
        .collection("classes")
        .doc(input.classId)
        .collection("kcs")
        .doc(input.kcId)
        .get()
        .catch(() => null);
      if (kcSnap?.exists) {
        topicTitle = cleanText(kcSnap.data()?.title, 80);
      }
    }

    const userData = (snap.data() || {}) as Record<string, unknown>;
    const prevTelemetry = userData.telemetryProfile as Partial<LearnerTelemetryProfile> | undefined;
    const defaultDwell = input.correct === false ? 115_000 : 75_000;
    const updatedTelemetry = applyTelemetryEvent(prevTelemetry, {
      questionId: input.questionId || `${input.activity || "study"}:${input.kcId || "general"}:${Date.now()}`,
      topic: topicTitle || input.kcId || "General Study",
      formulas: Array.isArray(input.formulas) ? input.formulas.slice(0, 4) : undefined,
      dwellMs: typeof input.dwellMs === "number" && input.dwellMs > 0 ? input.dwellMs : defaultDwell,
      peerMedianMs: typeof input.peerMedianMs === "number" && input.peerMedianMs > 0 ? input.peerMedianMs : 90_000,
      hintsUsed: typeof input.hintsUsed === "number" ? input.hintsUsed : 0,
      correct: typeof input.correct === "boolean" ? input.correct : undefined,
      scorePercent: typeof input.scorePercent === "number" ? input.scorePercent : undefined,
    });

    await userRef.set(
      {
        telemetryProfile: updatedTelemetry,
        learnerDnaSnapshot: {
          dominantCohort: updatedTelemetry.dominantCohort,
          predictedReadiness: updatedTelemetry.predictedExamReadiness,
          avgDwellRatio: updatedTelemetry.avgDwellRatio,
          questionsStudied: updatedTelemetry.questionsStudied,
          updatedAt: new Date().toISOString(),
        },
      },
      { merge: true }
    );
    invalidateLearnerDnaCache(input.uid);
  } catch {
    // Non-blocking adaptive telemetry
  }
}

/** Saves or clears a learner's explicit preferred coaching style override. */
export async function updateLearnerModalityPreference(
  uid: string,
  preferredCohort: LearningCohortId | null
): Promise<LearnerDna | null> {
  if (!uid) return null;
  const { adminDb } = await import("@/lib/firebase/admin");
  const db = adminDb();
  await db.collection("users").doc(uid).set(
    {
      preferredCohort: preferredCohort ?? null,
    },
    { merge: true }
  );
  invalidateLearnerDnaCache(uid);
  return loadLearnerDna(uid, { forceFresh: true });
}
