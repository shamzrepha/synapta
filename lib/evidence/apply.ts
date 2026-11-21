import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { updateMastery, Activity, OMEGA, MASTERY_THRESHOLD, safeBktParams } from "@/lib/bkt/engine";
import { ApiError } from "@/lib/api/errors";
import { trackProgress } from "@/lib/game/progress";
import { recordLearning } from "@/lib/streak/server";
import type { LearningKind } from "@/lib/streak/qualify";
import { notify } from "@/lib/notifications/server";
import { shareAchievement } from "@/lib/social/feed";

export interface ApplyEvidenceParams {
  uid: string;
  classId: string;
  kcId: string;
  activity: Activity;
  correct: boolean;
  metadata?: Record<string, unknown>;
}

export interface ApplyEvidenceResult {
  pLBefore: number;
  pLAfter: number;
  xpGained: number;
  totalXp: number;
  streakDays: number;
  mastered: boolean;
  crossedMasteryFirstTime: boolean;
}

/**
 * Authorization policy: evidence (mastery, XP, streaks) is earned only by an ACTIVE student of the class.
 * Every caller (flashcards, quizzes, labs, diagnostics, simulations, peer credit) passes through here, so the
 * check lives in this shared service and not in each route. Teachers and admins who preview a class do not
 * earn learner progress (their own previews never call this), and a user who is not enrolled cannot farm XP
 * by naming a class they can't see. For peer credit, `uid` is the credited peer, who must be enrolled too.
 */
export const ACTIVE_ENROLLMENT = "active";

/** Which streak learning kind each evidence activity earns (diagnostics are excluded at the call site). */
const LEARNING_KIND_FOR: Partial<Record<Activity, LearningKind>> = {
  quiz: "quiz",
  flashcard: "flashcard",
  theory: "theory",
  lab: "lab",
  peer_explain: "peer_explain",
};

/** Written (theory) answers that may move one topic's mastery per day. */
export const THEORY_DAILY_CAP = 5;

/**
 * Atomically updates Bayesian Knowledge Tracing (BKT) mastery, records
 * immutable evidence log, updates user XP, and manages streaks within a single transaction.
 */
export async function applyEvidence({
  uid,
  classId,
  kcId,
  activity,
  correct,
  metadata = {},
}: ApplyEvidenceParams): Promise<ApplyEvidenceResult> {
  const userRef = adminDb().collection("users").doc(uid);
  const masteryDocId = `${uid}_${kcId}`;
  const masteryRef = adminDb().collection("mastery").doc(masteryDocId);
  const evidenceRef = adminDb().collection("evidence").doc();
  const kcRef = adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId);
  const enrollmentRef = adminDb().collection("enrollments").doc(`${classId}_${uid}`);

  const result = await adminDb().runTransaction(async (t): Promise<ApplyEvidenceResult> => {
    // 0. Authorization: only an active student of this class earns evidence (checked in the same transaction)
    const enrollment = await t.get(enrollmentRef);
    if (!enrollment.exists || enrollment.data()?.status !== ACTIVE_ENROLLMENT) {
      throw new ApiError(403, "NOT_ENROLLED", "Join this class to earn progress in it.");
    }

    // 1. Read KC doc for BKT parameters (enforcing KC existence)
    const kcDoc = await t.get(kcRef);
    if (!kcDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", `Topic ${kcId} not found in class ${classId}`);
    }
    const kcData = kcDoc.data()!;
    const { pL0, pT, pG, pS } = safeBktParams(kcData?.bkt);

    // 2. Read existing Mastery doc
    const masteryDoc = await t.get(masteryRef);
    const masteryData = masteryDoc.exists ? masteryDoc.data() : null;
    const pLPrev = masteryData?.pL ?? pL0;
    const prevAttempts = masteryData?.attempts ?? 0;
    const prevCorrect = masteryData?.correct ?? 0;
    const lastLabAt = masteryData?.lastLabAt ?? null;
    const masteryBonusAwardedAt = masteryData?.masteryBonusAwardedAt ?? null;

    // Anti-farming guard: max 30 flashcard submissions per day per KC
    if (activity === "flashcard") {
      const todayStr = new Date().toISOString().split("T")[0];
      const lastDate = masteryData?.lastFlashcardDate;
      const countToday = lastDate === todayStr ? (masteryData?.flashcardCountToday ?? 0) : 0;
      if (countToday >= 30) {
        throw new ApiError(
          429,
          "FLASHCARD_RATE_LIMITED",
          "Daily flashcard practice limit reached for this concept (30/day). Try other activities or review tomorrow.",
          { "Retry-After": "3600" }
        );
      }
    }

    // Anti-farming guard: written practice is marked by AI, so at most 5 credited answers per day per topic
    if (activity === "theory") {
      const todayStr = new Date().toISOString().split("T")[0];
      const countToday = masteryData?.lastTheoryDate === todayStr ? (masteryData?.theoryCountToday ?? 0) : 0;
      if (countToday >= THEORY_DAILY_CAP) {
        throw new ApiError(429, "THEORY_RATE_LIMITED", "Written practice for this topic has counted 5 times today. Keep practising: it just won't change your mastery score until tomorrow.", { "Retry-After": "3600" });
      }
    }

    // Anti-farming guard: max 1 lab completion per 10 minutes per KC
    if (activity === "lab" && lastLabAt) {
      const lastLabMillis =
        typeof lastLabAt.toMillis === "function"
          ? lastLabAt.toMillis()
          : new Date(lastLabAt).getTime();
      const diffMinutes = (Date.now() - lastLabMillis) / (1000 * 60);
      if (diffMinutes < 10) {
        const waitTime = Math.ceil(10 - diffMinutes);
        throw new ApiError(
          429,
          "LAB_RATE_LIMITED",
          `Lab evidence rate-limited. Please wait ${waitTime} more minute(s) before resubmitting for this concept.`,
          { "Retry-After": (waitTime * 60).toString() }
        );
      }
    }

    // 3. Compute new mastery via BKT engine
    const pLAfter = updateMastery(pLPrev, correct, { pT, pG, pS }, activity);
    // Crossed mastery first time only if it crossed threshold AND bonus was never awarded before
    const crossedMasteryFirstTime = pLPrev < MASTERY_THRESHOLD && pLAfter >= MASTERY_THRESHOLD && !masteryBonusAwardedAt;

    // 4. Calculate XP
    let xpEarned = 1; // base effort for attempting
    if (metadata?.diagnostic === true) {
      xpEarned = 0; // Diagnostic assessment establishes baseline without inflating gamified XP
    } else {
      if (correct) {
        if (activity === "quiz") {
          xpEarned = 10;
        } else if (activity === "flashcard") {
          // Anti-farming: Full +5 XP awarded for the first 5 cards per KC each day; 1 XP effort reward thereafter
          const todayStr = new Date().toISOString().split("T")[0];
          const lastDate = masteryData?.lastFlashcardDate;
          const countToday = lastDate === todayStr ? (masteryData?.flashcardCountToday ?? 0) : 0;
          xpEarned = countToday < 5 ? 5 : 1;
        } else if (activity === "theory") {
          xpEarned = 6; // below a quiz answer: it is self-paced and AI-marked
        } else if (activity === "lab") {
          xpEarned = 30;
        } else if (activity === "peer_explain") {
          xpEarned = 40;
        }
      }
      if (crossedMasteryFirstTime) {
        xpEarned += 100; // Mastery achievement reward (once per KC lifetime)
      }
    }

    // 5. Read User doc for streak and XP calculation
    const userDoc = await t.get(userRef);
    const userData = userDoc.exists ? userDoc.data() : null;

    const currentXp = (userData?.xp ?? 0) + xpEarned;
    const currentStreak = Math.max(0, userData?.streakDays || 0);
    const todayStr = new Date().toISOString().split("T")[0];

    // 6. Transactional writes
    const masteryUpdates: Record<string, unknown> = {
      uid,
      classId,
      kcId,
      pL: pLAfter,
      attempts: prevAttempts + 1,
      correct: prevCorrect + (correct ? 1 : 0),
      lastUpdated: Timestamp.now(),
      lastPracticedAt: Timestamp.now(),
      stability: masteryDoc.exists ? (masteryDoc.data()?.stability ?? 1.0) : 1.0,
      nextReviewAt: masteryDoc.exists ? (masteryDoc.data()?.nextReviewAt ?? null) : null,
    };
    if (activity === "lab") {
      masteryUpdates.lastLabAt = Timestamp.now();
    }
    if (activity === "flashcard") {
      const lastDate = masteryData?.lastFlashcardDate;
      const countToday = lastDate === todayStr ? (masteryData?.flashcardCountToday ?? 0) : 0;
      masteryUpdates.flashcardCountToday = countToday + 1;
      masteryUpdates.lastFlashcardDate = todayStr;
    }
    if (activity === "theory") {
      const lastDate = masteryData?.lastTheoryDate;
      masteryUpdates.theoryCountToday = (lastDate === todayStr ? (masteryData?.theoryCountToday ?? 0) : 0) + 1;
      masteryUpdates.lastTheoryDate = todayStr;
    }
    if (crossedMasteryFirstTime) {
      masteryUpdates.masteryBonusAwardedAt = Timestamp.now();
    }

    t.set(masteryRef, masteryUpdates, { merge: true });

    // Write immutable evidence log
    t.set(evidenceRef, {
      uid,
      classId,
      kcId,
      activity,
      correct,
      omega: OMEGA[activity],
      pLBefore: pLPrev,
      pLAfter,
      xpEarned,
      metadata,
      createdAt: Timestamp.now(),
    });

    // Update user doc
    // The streak is NOT touched here: a day counts only once enough learning points are recorded (recordLearning below)
    t.update(userRef, { xp: currentXp, updatedAt: Timestamp.now() });

    return {
      pLBefore: pLPrev,
      pLAfter,
      xpGained: xpEarned,
      totalXp: currentXp,
      streakDays: currentStreak,
      mastered: pLAfter >= MASTERY_THRESHOLD,
      crossedMasteryFirstTime,
    };
  });

  // Gamification (levels, quests, badges, leagues, notifications) runs after the mastery
  // transaction commits and never blocks or fails it.
  await trackProgress({
    uid,
    xpAlreadyApplied: result.xpGained,
    stats: {
      evidence: 1,
      quizAnswered: activity === "quiz" ? 1 : 0,
      quizCorrect: activity === "quiz" && correct ? 1 : 0,
      labs: activity === "lab" && correct ? 1 : 0,
      flashcards: activity === "flashcard" ? 1 : 0,
      peerHelps: activity === "peer_explain" && correct ? 1 : 0,
      masteries: result.crossedMasteryFirstTime ? 1 : 0,
    },
    reason: `evidence:${activity}`,
  });
  // Streak: a credited learning action earns learning points; the day qualifies at 30 (lib/streak/qualify.ts)
  const kind = LEARNING_KIND_FOR[activity];
  const creditable = kind === "lab" || kind === "peer_explain" ? correct : true; // a lab counts when completed
  if (kind && creditable && metadata?.diagnostic !== true) {
    const learned = await recordLearning(uid, kind).catch(() => null);
    if (learned) result.streakDays = learned.streakDays;
  }
  if (result.crossedMasteryFirstTime) {
    try {
      const kc = await kcRef.get();
      const title = kc.data()?.title || "a topic";
      await notify(uid, {
        type: "mastery",
        title: `You mastered ${title}! 🏅`,
        body: "+100 bonus XP",
        href: `/classes/${classId}/topics/${kcId}`,
        icon: "🏅",
      });
      await shareAchievement(uid, `mastered **${title}** 🏅`, { type: "mastery", classId, kcId });
    } catch {
      // Celebration only; mastery itself is already saved
    }
  }
  return result;
}

/**
 * Like applyEvidence, for routes where people who aren't active members can still use the activity (a teacher
 * previewing a quiz, a student whose join request is pending): they get their feedback, just no credit, instead of
 * an error after their answer was already saved. Any other failure is still thrown.
 */
export async function applyEvidenceIfEnrolled(params: Parameters<typeof applyEvidence>[0]): Promise<Awaited<ReturnType<typeof applyEvidence>> | null> {
  try {
    const res = await applyEvidence(params);
    import("@/lib/adaptive/learner-dna")
      .then(({ recordAdaptiveSignal }) =>
        recordAdaptiveSignal({
          uid: params.uid,
          classId: params.classId,
          kcId: params.kcId,
          activity: params.activity,
          correct: params.correct,
        })
      )
      .catch(() => {});
    return res;
  } catch (e) {
    if (e instanceof ApiError && e.code === "NOT_ENROLLED") return null;
    throw e;
  }
}
