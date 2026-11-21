import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { getClassAccess } from "@/lib/auth/classAccess";
import {
  applyTelemetryEvent,
  createDefaultTelemetryProfile,
  DEFAULT_PEER_MEDIAN_MS,
  evaluateCohortHealth,
  LEARNING_COHORTS,
  updatePeerMedianMs,
  type LearnerTelemetryProfile,
} from "@/lib/learning/telemetry";

export const runtime = "nodejs";

const telemetryEventSchema = z.object({
  questionId: z.string().trim().min(1).max(120),
  classId: z.string().trim().max(120).optional(),
  topic: z.string().trim().max(160).optional(),
  formulas: z.array(z.string().trim().max(240)).max(12).optional(),
  dwellMs: z.number().int().min(1_000).max(3_600_000),
  hintsUsed: z.number().int().min(0).max(20).optional(),
  correct: z.boolean().optional(),
  scorePercent: z.number().min(0).max(100).optional(),
  preferredCohort: z
    .enum(["step_by_step_procedural", "visual_intuitive", "example_driven", "first_principles"])
    .optional(),
});

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const userDoc = await adminDb().collection("users").doc(caller.uid).get();
    const raw = (userDoc.data()?.telemetryProfile || {}) as Partial<LearnerTelemetryProfile>;
    const profile: LearnerTelemetryProfile = {
      ...createDefaultTelemetryProfile(),
      ...raw,
      cohortWeights: {
        ...createDefaultTelemetryProfile().cohortWeights,
        ...(raw.cohortWeights || {}),
      },
      weakFormulas: Array.isArray(raw.weakFormulas) ? raw.weakFormulas : [],
      weakTopics: Array.isArray(raw.weakTopics) ? raw.weakTopics : [],
      completedQuestionIds: Array.isArray(raw.completedQuestionIds) ? raw.completedQuestionIds : [],
      topicProgress: raw.topicProgress || {},
    };

    return NextResponse.json({
      ok: true,
      data: {
        profile,
        cohortDescriptor: LEARNING_COHORTS[profile.dominantCohort],
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "telemetry", limit: 90, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, telemetryEventSchema);

    let peerMedianMs = DEFAULT_PEER_MEDIAN_MS;
    let selfHealTriggered = false;

    const userRef = adminDb().collection("users").doc(caller.uid);
    const userSnap = await userRef.get();
    const prevProfile = (userSnap.data()?.telemetryProfile || undefined) as
      | Partial<LearnerTelemetryProfile>
      | undefined;

    // 1. If tied to a class past question, update rolling peer median AND cohort clarity feedback (Self-Healing Loop)
    // Only a member of the class may feed its shared numbers (peer median, clarity votes)
    const inClass = body.classId ? await getClassAccess(caller, body.classId).then((a) => a.canView).catch(() => false) : false;
    if (body.classId && inClass) {
      const qRef = adminDb()
        .collection("classes")
        .doc(body.classId)
        .collection("pastQuestions")
        .doc(body.questionId);
      const qSnap = await qRef.get();
      if (qSnap.exists) {
        const qData = qSnap.data() || {};
        peerMedianMs = typeof qData.peerMedianMs === "number" ? qData.peerMedianMs : DEFAULT_PEER_MEDIAN_MS;
        const nextPeer = updatePeerMedianMs(qData.peerMedianMs, qData.dwellSampleCount, body.dwellMs);

        const activeCohort =
          body.preferredCohort || prevProfile?.dominantCohort || "step_by_step_procedural";
        const prevFeedback = qData.cohortFeedback?.[activeCohort] || { mastered: 0, reExplain: 0 };
        // one clarity vote per learner per explanation version: repeated "didn't get it" must not force the AI to rewrite it
        const healedCount = prevFeedback.healedCount || 0;
        const voteRef = qRef.collection("clarityVotes").doc(`${caller.uid}_${activeCohort}`);
        const prevVote = await voteRef.get();
        const alreadyVoted = prevVote.exists && prevVote.data()?.healedCount === healedCount;
        const votes = body.correct !== undefined && !alreadyVoted;
        if (votes) await voteRef.set({ healedCount, correct: body.correct, at: Timestamp.now() });
        const updatedFeedback = {
          mastered: prevFeedback.mastered + (votes && body.correct === true ? 1 : 0),
          reExplain: prevFeedback.reExplain + (votes && body.correct === false ? 1 : 0),
          healedCount,
        };
        const health = evaluateCohortHealth(updatedFeedback);
        selfHealTriggered = health.needsHeal;

        await qRef.set(
          {
            peerMedianMs: nextPeer.peerMedianMs,
            dwellSampleCount: nextPeer.sampleCount,
            cohortFeedback: {
              ...(qData.cohortFeedback || {}),
              [activeCohort]: updatedFeedback,
            },
          },
          { merge: true }
        );
      }
    }

    // 2. Apply new engagement/struggle signal to learner telemetry profile
    const updatedProfile = applyTelemetryEvent(prevProfile, {
      questionId: body.questionId,
      classId: body.classId,
      topic: body.topic,
      formulas: body.formulas,
      dwellMs: body.dwellMs,
      peerMedianMs,
      hintsUsed: body.hintsUsed,
      correct: body.correct,
      scorePercent: body.scorePercent,
      preferredCohort: body.preferredCohort,
    });

    await userRef.set(
      {
        telemetryProfile: updatedProfile,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      data: {
        profile: updatedProfile,
        peerMedianMs,
        selfHealTriggered,
        cohortDescriptor: LEARNING_COHORTS[updatedProfile.dominantCohort],
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
