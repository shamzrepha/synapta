import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { planOf } from "@/lib/billing/plans";
import { generateWithFallback } from "@/lib/ai/router";
import {
  createDefaultTelemetryProfile,
  DEFAULT_PEER_MEDIAN_MS,
  LEARNING_COHORTS,
  type LearnerTelemetryProfile,
  type LearningCohortId,
} from "@/lib/learning/telemetry";

export const runtime = "nodejs";
export const maxDuration = 60;

const solveSchema = z.object({
  questionId: z.string().min(1).max(100),
  questionText: z.string().trim().min(3).max(3000),
  courseCode: z.string().max(40).optional(),
  topic: z.string().trim().max(140).optional(),
  cohortId: z
    .enum(["step_by_step_procedural", "visual_intuitive", "example_driven", "first_principles"])
    .optional(),
});

const uploadQuestionSchema = z.object({
  year: z.string().trim().min(2).max(40),
  questionNumber: z.string().trim().min(1).max(20),
  topic: z.string().trim().min(2).max(120),
  questionText: z.string().trim().min(5).max(3000),
});

/**
 * Past Questions & Cohort-Cached Solver API:
 *
 * 1. GET: Lists class past questions, user's subscription access, teacher upload permission,
 *         and the student's TikTok/FYP Learning Telemetry Profile.
 * 2. POST: Solves a past question for a specific Learning Style Cohort (`cohortId`).
 *          CACHE-FIRST: Checks `cohortSolutions[cohortId]` in Firestore first ($0 AI token cost).
 *          Generates via AI only for the very first student in that cohort, then caches permanently.
 * 3. PUT: Allows teachers/admins to upload new past exam questions into the class bank.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireUser(req);
    const { id: classId } = await params;

    const [classSnap, questionsSnap, userDoc] = await Promise.all([
      adminDb().collection("classes").doc(classId).get(),
      adminDb().collection("classes").doc(classId).collection("pastQuestions").limit(60).get(),
      adminDb().collection("users").doc(caller.uid).get(),
    ]);

    const classData = classSnap.data() || {};
    const items = questionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const userData = userDoc.data() || {};
    const userPlan = planOf(userData);

    // Normal Plus subscribers, Exam Pass subscribers, Teachers, and Admins have full access
    const isSubscriber =
      userPlan.id === "plus" ||
      userPlan.id === "exam" ||
      userPlan.id === "teacher" ||
      caller.role === "teacher" ||
      caller.role === "admin";

    const canUpload =
      caller.role === "admin" ||
      caller.role === "teacher" ||
      classData.teacherId === caller.uid ||
      classData.ownerId === caller.uid;

    const rawTelemetry = (userData.telemetryProfile || {}) as Partial<LearnerTelemetryProfile>;
    const telemetryProfile: LearnerTelemetryProfile = {
      ...createDefaultTelemetryProfile(),
      ...rawTelemetry,
      cohortWeights: {
        ...createDefaultTelemetryProfile().cohortWeights,
        ...(rawTelemetry.cohortWeights || {}),
      },
      weakFormulas: Array.isArray(rawTelemetry.weakFormulas) ? rawTelemetry.weakFormulas : [],
      weakTopics: Array.isArray(rawTelemetry.weakTopics) ? rawTelemetry.weakTopics : [],
    };

    return NextResponse.json({
      ok: true,
      data: {
        items,
        isSubscriber,
        canUpload,
        plan: userPlan.id,
        telemetryProfile,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireUser(req);
    const { id: classId } = await params;
    const body = await parseJson(req, solveSchema);

    const userDoc = await adminDb().collection("users").doc(caller.uid).get();
    const userData = userDoc.data() || {};
    const userPlan = planOf(userData);
    const isSubscriber =
      userPlan.id === "plus" ||
      userPlan.id === "exam" ||
      userPlan.id === "teacher" ||
      caller.role === "teacher" ||
      caller.role === "admin";

    // Determine target learning cohort (explicit switch or user's dominant FYP cohort)
    const userCohort = (userData.telemetryProfile?.dominantCohort ||
      "step_by_step_procedural") as LearningCohortId;
    const targetCohort: LearningCohortId = body.cohortId || userCohort;
    const cohortMeta = LEARNING_COHORTS[targetCohort] || LEARNING_COHORTS.step_by_step_procedural;

    const docRef = adminDb().collection("classes").doc(classId).collection("pastQuestions").doc(body.questionId);
    const existing = await docRef.get();
    const existingData = existing.data() || {};

    // 1. COHORT CACHE HIT: Return pre-stored cohort explanation at $0 AI cost!
    const cachedCohortSolution = existingData.cohortSolutions?.[targetCohort];
    if (existing.exists && cachedCohortSolution) {
      return NextResponse.json({
        ok: true,
        data: {
          id: existing.id,
          ...existingData,
          solution: cachedCohortSolution,
          activeCohort: targetCohort,
          cached: true,
        },
      });
    }

    // 2. Access check for Free tier (1 preview past question limit)
    if (!isSubscriber) {
      const historySnap = await adminDb()
        .collection("users")
        .doc(caller.uid)
        .collection("pastQuestionAttempts")
        .limit(3)
        .get();
      if (historySnap.size >= 1) {
        throw new ApiError(
          403,
          "SUBSCRIPTION_REQUIRED",
          "You've used your 1 free past question preview! Unlock unlimited past papers with the ₦1,500 Exam Pass or the All-Access Plus Pass."
        );
      }
    }

    // 3. FIRST-TIME COHORT GENERATION: Generate once for this learning style group and cache permanently
    const systemPrompt = `You are Sprout, SunRoot's adaptive university exam tutor.
Break down this university examination past question for the "${cohortMeta.label}" learner group.
${cohortMeta.aiPromptDirective}

Output clean JSON matching:
{
  "cohortStyle": "${targetCohort}",
  "keyPrinciple": "string (1-2 sentences on the underlying concept/theorem adapted to this cohort style)",
  "formulas": ["string (exact mathematical formulas or recurrence relations used)"],
  "hints": ["string (progressive hint before revealing full steps)"],
  "steps": [
    { "stepNumber": 1, "title": "string", "detail": "string with clear derivation tailored to the cohort style" }
  ],
  "finalAnswer": "string (the clear final answer with units/complexity)",
  "examinerTraps": ["string (common mistakes students make on this exact question)"],
  "twinQuestion": {
    "question": "string (similar twin question with different numbers/parameters to test mastery)",
    "solution": "string (concise worked solution)"
  }
}`;

    const result = await generateWithFallback({
      task: "quiz_gen",
      systemInstruction: systemPrompt,
      userPrompt: `Course: ${body.courseCode || "University Course"}\nTopic: ${body.topic || "Core Syllabus"}\nQuestion:\n${body.questionText}`,
      temperature: 0.3,
      userId: caller.uid,
    });

    const solutionData = result.data || {};
    const prevCohortSolutions = existingData.cohortSolutions || {};

    const savedDoc = {
      questionId: body.questionId,
      questionText: body.questionText,
      topic: body.topic || existingData.topic || "Core Syllabus",
      courseCode: body.courseCode || existingData.courseCode || "",
      peerMedianMs: existingData.peerMedianMs || DEFAULT_PEER_MEDIAN_MS,
      solution: existingData.solution || solutionData,
      cohortSolutions: {
        ...prevCohortSolutions,
        [targetCohort]: solutionData,
      },
      generatedBy: caller.uid,
      updatedAt: Timestamp.now(),
    };

    await docRef.set(savedDoc, { merge: true });

    // Track attempt for free usage limit
    await adminDb().collection("users").doc(caller.uid).collection("pastQuestionAttempts").add({
      classId,
      questionId: body.questionId,
      cohortId: targetCohort,
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({
      ok: true,
      data: {
        id: body.questionId,
        ...savedDoc,
        solution: solutionData,
        activeCohort: targetCohort,
        cached: false,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireUser(req);
    const { id: classId } = await params;
    const body = await parseJson(req, uploadQuestionSchema);

    const classSnap = await adminDb().collection("classes").doc(classId).get();
    const classData = classSnap.data() || {};
    const canUpload =
      caller.role === "admin" ||
      caller.role === "teacher" ||
      classData.teacherId === caller.uid ||
      classData.ownerId === caller.uid;

    if (!canUpload) {
      throw new ApiError(403, "FORBIDDEN", "Only the course lecturer or an admin can upload past questions.");
    }

    const qRef = adminDb().collection("classes").doc(classId).collection("pastQuestions").doc();
    const newQuestion = {
      id: qRef.id,
      questionId: qRef.id,
      year: body.year,
      questionNumber: body.questionNumber,
      topic: body.topic,
      questionText: body.questionText,
      peerMedianMs: DEFAULT_PEER_MEDIAN_MS,
      dwellSampleCount: 1,
      uploadedBy: caller.uid,
      createdAt: Timestamp.now(),
    };

    await qRef.set(newQuestion);

    return NextResponse.json({
      ok: true,
      data: newQuestion,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
