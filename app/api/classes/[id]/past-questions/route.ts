import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { planOf } from "@/lib/billing/plans";
import { generateWithFallback } from "@/lib/ai/router";
import {
  applyTelemetryEvent,
  createDefaultTelemetryProfile,
  DEFAULT_PEER_MEDIAN_MS,
  evaluateCohortHealth,
  LEARNING_COHORTS,
  type LearnerTelemetryProfile,
  type LearningCohortId,
} from "@/lib/learning/telemetry";

export const runtime = "nodejs";
export const maxDuration = 60;

const solveSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("solve").optional().default("solve"),
    questionId: z.string().min(1).max(100),
    questionText: z.string().trim().min(3).max(3000),
    courseCode: z.string().max(40).optional(),
    topic: z.string().trim().max(140).optional(),
    cohortId: z
      .enum(["step_by_step_procedural", "visual_intuitive", "example_driven", "first_principles"])
      .optional(),
  }),
  z.object({
    action: z.literal("grade_handwritten"),
    questionId: z.string().min(1).max(100),
    questionText: z.string().trim().min(3).max(3000),
    topic: z.string().trim().max(140).optional(),
    maxMarks: z.number().int().min(5).max(100).optional().default(15),
    imageDataUrl: z.string().max(4_000_000).optional(),
    writtenWork: z.string().trim().max(4000).optional(),
    dwellMs: z.number().int().min(1_000).max(3_600_000).optional().default(90_000),
  }),
]);

// Backwards-compatible fallback when caller omits `action`
const legacySolveSchema = z.object({
  questionId: z.string().min(1).max(100),
  questionText: z.string().trim().min(3).max(3000),
  courseCode: z.string().max(40).optional(),
  topic: z.string().trim().max(140).optional(),
  cohortId: z
    .enum(["step_by_step_procedural", "visual_intuitive", "example_driven", "first_principles"])
    .optional(),
});

const uploadQuestionSchema = z.object({
  mode: z.enum(["single", "bulk_scan"]).optional().default("single"),
  year: z.string().trim().min(2).max(40),
  questionNumber: z.string().trim().max(20).optional().default("1"),
  topic: z.string().trim().max(120).optional().default("Core Syllabus"),
  questionType: z.enum(["theory", "objective", "calculation"]).optional().default("theory"),
  questionText: z.string().trim().max(8000).optional().default(""),
  marks: z.number().int().min(1).max(100).optional().default(15),
  options: z.array(z.string().trim().max(300)).max(6).optional(),
  correctIndex: z.number().int().min(0).max(5).optional(),
  examImageDataUrl: z.string().max(4_500_000).optional(),
});

const handwrittenGradeOutputSchema = z.object({
  scoreAwarded: z.number(),
  maxMarks: z.number(),
  scorePercent: z.number(),
  verdict: z.enum(["excellent", "partial", "needs_work"]),
  transcribedSteps: z.array(z.string()).default([]),
  stepFeedback: z
    .array(
      z.object({
        step: z.string(),
        status: z.enum(["correct", "partial", "error"]),
        comment: z.string(),
      })
    )
    .default([]),
  missingFormulasOrUnits: z.array(z.string()).default([]),
  examinerAdvice: z.string(),
});

const bulkExtractedSchema = z.object({
  questions: z
    .array(
      z.object({
        questionNumber: z.string(),
        topic: z.string(),
        questionType: z.enum(["theory", "objective", "calculation"]).default("theory"),
        questionText: z.string(),
        marks: z.number().optional().default(10),
        options: z.array(z.string()).optional(),
        correctIndex: z.number().optional(),
        explanation: z.string().optional(),
      })
    )
    .min(1)
    .max(15),
});

function parseDataUrl(dataUrl?: string): { mimeType: string; data: string } | null {
  if (!dataUrl || !dataUrl.startsWith("data:image/")) return null;
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireUser(req);
    const { id: classId } = await params;

    const [classSnap, questionsSnap, userDoc] = await Promise.all([
      adminDb().collection("classes").doc(classId).get(),
      adminDb().collection("classes").doc(classId).collection("pastQuestions").limit(80).get(),
      adminDb().collection("users").doc(caller.uid).get(),
    ]);

    const classData = classSnap.data() || {};
    const items = questionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const userData = userDoc.data() || {};
    const userPlan = planOf(userData);

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
      completedQuestionIds: Array.isArray(rawTelemetry.completedQuestionIds)
        ? rawTelemetry.completedQuestionIds
        : [],
      topicProgress: rawTelemetry.topicProgress || {},
    };

    return NextResponse.json({
      ok: true,
      data: {
        classTitle: classData.title || classData.name || classId,
        classDepartment: classData.department || null,
        classInstitution: classData.institution || null,
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

    const rawJson = await req.json().catch(() => ({}));
    const parsedAction = solveSchema.safeParse(rawJson);
    const body = parsedAction.success
      ? parsedAction.data
      : { action: "solve" as const, ...legacySolveSchema.parse(rawJson) };

    const userRef = adminDb().collection("users").doc(caller.uid);
    const userDoc = await userRef.get();
    const userData = userDoc.data() || {};
    const userPlan = planOf(userData);
    const isSubscriber =
      userPlan.id === "plus" ||
      userPlan.id === "exam" ||
      userPlan.id === "teacher" ||
      caller.role === "teacher" ||
      caller.role === "admin";

    // =========================================================================
    // ACTION A: HANDWRITTEN PAPER SNAP & AI EXAM GRADER
    // =========================================================================
    if (body.action === "grade_handwritten") {
      if (!isSubscriber) {
        const historySnap = await userRef.collection("pastQuestionAttempts").limit(3).get();
        if (historySnap.size >= 1) {
          throw new ApiError(
            403,
            "SUBSCRIPTION_REQUIRED",
            "Handwritten Paper Snap & Marking is part of the ₦1,500 Exam Pass and Plus Pass."
          );
        }
      }

      const inlineImg = parseDataUrl(body.imageDataUrl);
      if (!inlineImg && (!body.writtenWork || body.writtenWork.length < 3)) {
        throw new ApiError(
          400,
          "VALIDATION",
          "Snap or upload a photo of your handwritten solution, or type your workings to be graded."
        );
      }

      const systemInstruction = `You are Sprout, a senior university chief examiner.
Grade the student's handwritten/worked exam solution against the question.
1. Transcribe the student's handwritten steps accurately.
2. Check mathematical/logical validity line-by-line, formula application, and final units.
3. Award fair marks out of ${body.maxMarks} (granting method marks for correct steps even if there is an arithmetic slip).
4. Return strict JSON matching the schema.`;

      const promptText = `Course/Class: ${classId}
Topic: ${body.topic || "Core Syllabus"}
Max Marks: ${body.maxMarks}
Exam Question:
${body.questionText}

${body.writtenWork ? `Student's Typed/Additional Notes:\n${body.writtenWork}` : "Evaluate the attached photo of the student's handwritten paper work."}`;

      const contents = inlineImg
        ? [
            {
              role: "user",
              parts: [{ inlineData: inlineImg }, { text: promptText }],
            },
          ]
        : undefined;

      const gradeRes = await generateWithFallback({
        task: "grading_high_stakes",
        systemInstruction,
        userPrompt: promptText,
        contents,
        schema: handwrittenGradeOutputSchema,
        temperature: 0.2,
        userId: caller.uid,
      });

      const report = gradeRes.data || {
        scoreAwarded: Math.round(body.maxMarks * 0.7),
        maxMarks: body.maxMarks,
        scorePercent: 70,
        verdict: "partial" as const,
        transcribedSteps: [],
        stepFeedback: [],
        missingFormulasOrUnits: [],
        examinerAdvice: "Good attempt. Check intermediate substitutions and state your units clearly.",
      };

      const updatedTelemetry = applyTelemetryEvent(userData.telemetryProfile, {
        questionId: body.questionId,
        classId,
        topic: body.topic || "Core Syllabus",
        formulas: report.missingFormulasOrUnits,
        dwellMs: body.dwellMs || DEFAULT_PEER_MEDIAN_MS,
        correct: report.scorePercent >= 60,
        scorePercent: report.scorePercent,
      });

      await userRef.set(
        {
          telemetryProfile: updatedTelemetry,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

      await userRef.collection("pastQuestionAttempts").add({
        classId,
        questionId: body.questionId,
        mode: "handwritten",
        scoreAwarded: report.scoreAwarded,
        maxMarks: report.maxMarks,
        scorePercent: report.scorePercent,
        createdAt: Timestamp.now(),
      });

      return NextResponse.json({
        ok: true,
        data: {
          report,
          telemetryProfile: updatedTelemetry,
        },
      });
    }

    // =========================================================================
    // ACTION B: COHORT-CACHED STEP-BY-STEP SOLVER (WITH SELF-HEALING LOOP)
    // =========================================================================
    const userCohort = (userData.telemetryProfile?.dominantCohort ||
      "step_by_step_procedural") as LearningCohortId;
    const targetCohort: LearningCohortId = body.cohortId || userCohort;
    const cohortMeta = LEARNING_COHORTS[targetCohort] || LEARNING_COHORTS.step_by_step_procedural;

    const docRef = adminDb().collection("classes").doc(classId).collection("pastQuestions").doc(body.questionId);
    const existing = await docRef.get();
    const existingData = existing.data() || {};

    // Check Self-Healing Clarity Health for this cohort's cached solution
    const cohortFeedback = existingData.cohortFeedback?.[targetCohort];
    const health = evaluateCohortHealth(cohortFeedback);
    const cachedCohortSolution = existingData.cohortSolutions?.[targetCohort];

    // 1. COHORT CACHE HIT (if healthy): Return pre-stored cohort explanation at $0 AI cost!
    if (existing.exists && cachedCohortSolution && !health.needsHeal) {
      return NextResponse.json({
        ok: true,
        data: {
          id: existing.id,
          ...existingData,
          solution: cachedCohortSolution,
          activeCohort: targetCohort,
          cached: true,
          selfHealed: false,
        },
      });
    }

    // 2. Access check for Free tier (1 preview past question limit)
    if (!isSubscriber) {
      const historySnap = await userRef.collection("pastQuestionAttempts").limit(3).get();
      if (historySnap.size >= 1) {
        throw new ApiError(
          403,
          "SUBSCRIPTION_REQUIRED",
          "You've used your 1 free past question preview! Unlock unlimited past papers with the ₦1,500 Exam Pass or the All-Access Plus Pass."
        );
      }
    }

    // 3. FIRST-TIME OR SELF-HEALING COHORT GENERATION
    const healNote = health.needsHeal
      ? "\nIMPORTANT SELF-HEALING DIRECTIVE: Previous students in this cohort found the earlier explanation hard to follow. Make every step twice as clear, add a concrete intuitive bridge, and highlight why each formula applies."
      : "";

    const systemPrompt = `You are Sprout, SunRoot's adaptive university exam tutor.
Break down this university examination past question for the "${cohortMeta.label}" learner group.
${cohortMeta.aiPromptDirective}${healNote}

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
  },
  "cbtBlock": {
    "stem": "string (a multiple-choice CBT exam question testing this exact concept/calculation)",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "string (why the correct option is right)"
  }
}`;

    const result = await generateWithFallback({
      task: "quiz_gen",
      systemInstruction: systemPrompt,
      userPrompt: `Course: ${body.courseCode || classId}\nTopic: ${body.topic || "Core Syllabus"}\nQuestion:\n${body.questionText}`,
      temperature: 0.3,
      userId: caller.uid,
    });

    const solutionData = (result.data || {}) as Record<string, unknown>;
    const prevCohortSolutions = existingData.cohortSolutions || {};
    const prevFeedbackAll = existingData.cohortFeedback || {};
    const prevHealCount = prevFeedbackAll[targetCohort]?.healedCount || 0;

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
      cohortFeedback: {
        ...prevFeedbackAll,
        [targetCohort]: {
          mastered: 0,
          reExplain: 0,
          healedCount: health.needsHeal ? prevHealCount + 1 : prevHealCount,
        },
      },
      generatedBy: caller.uid,
      updatedAt: Timestamp.now(),
    };

    await docRef.set(savedDoc, { merge: true });

    await userRef.collection("pastQuestionAttempts").add({
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
        selfHealed: health.needsHeal,
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

    // =========================================================================
    // MODE 1: BULK EXAM PAPER SCANNER (PHOTO OR RAW EXAM TEXT -> TOPIC-TAGGED BANK)
    // =========================================================================
    if (body.mode === "bulk_scan") {
      const inlineImg = parseDataUrl(body.examImageDataUrl);
      if (!inlineImg && (!body.questionText || body.questionText.length < 10)) {
        throw new ApiError(
          400,
          "VALIDATION",
          "Provide an exam paper photo or paste the exam paper text to bulk-extract questions."
        );
      }

      const systemInstruction = `You are Sprout's University Exam Paper Digitizer.
Extract all examination questions from the provided university past paper (image or text).
For every question:
1. Identify its questionNumber (e.g., "1(a)", "1(b)", "Obj 1", "2").
2. Categorize it under a clear academic syllabus topic (e.g., "Thermodynamics First Law", "Pointer Arithmetic", "Graph Traversal").
3. Set questionType to "objective" if it is multiple-choice (and extract its 4 options + correctIndex 0-3), "calculation" if numerical, or "theory" if essay/derivation.
4. Return clean JSON matching the schema.`;

      const userPrompt = `Course: ${classData.title || classId}
Exam Session/Year: ${body.year}
Default Topic Fallback: ${body.topic}
${body.questionText ? `Raw Exam Paper Text:\n${body.questionText}` : "Extract all questions from the attached exam paper image."}`;

      const contents = inlineImg
        ? [
            {
              role: "user",
              parts: [{ inlineData: inlineImg }, { text: userPrompt }],
            },
          ]
        : undefined;

      const extractedRes = await generateWithFallback({
        task: "structured_spec",
        systemInstruction,
        userPrompt,
        contents,
        schema: bulkExtractedSchema,
        temperature: 0.2,
        userId: caller.uid,
        isPrivileged: true,
      });

      const extractedList = extractedRes.data?.questions || [];
      if (extractedList.length === 0) {
        throw new ApiError(422, "EXTRACTION_FAILED", "Could not detect exam questions from that input.");
      }

      const batch = adminDb().batch();
      const createdItems = [];

      for (const item of extractedList) {
        const qRef = adminDb().collection("classes").doc(classId).collection("pastQuestions").doc();
        const docData = {
          id: qRef.id,
          questionId: qRef.id,
          year: body.year,
          questionNumber: item.questionNumber || "1",
          topic: item.topic || body.topic || "Core Syllabus",
          questionType: item.questionType || "theory",
          questionText: item.questionText,
          marks: item.marks || 10,
          options: item.options || [],
          correctIndex: typeof item.correctIndex === "number" ? item.correctIndex : 0,
          explanation: item.explanation || "",
          peerMedianMs: DEFAULT_PEER_MEDIAN_MS,
          dwellSampleCount: 1,
          uploadedBy: caller.uid,
          createdAt: Timestamp.now(),
        };
        batch.set(qRef, docData);
        createdItems.push(docData);
      }

      await batch.commit();

      return NextResponse.json({
        ok: true,
        data: {
          mode: "bulk_scan",
          items: createdItems,
        },
      });
    }

    // =========================================================================
    // MODE 2: SINGLE CATEGORIZED QUESTION UPLOAD (THEORY / OBJECTIVE / CALCULATION)
    // =========================================================================
    if (!body.questionText || body.questionText.length < 3) {
      throw new ApiError(400, "VALIDATION", "Enter the question text.");
    }

    const qRef = adminDb().collection("classes").doc(classId).collection("pastQuestions").doc();
    const newQuestion = {
      id: qRef.id,
      questionId: qRef.id,
      year: body.year,
      questionNumber: body.questionNumber || "1",
      topic: body.topic || "Core Syllabus",
      questionType: body.questionType || "theory",
      questionText: body.questionText,
      marks: body.marks || 15,
      options: body.questionType === "objective" ? body.options || [] : [],
      correctIndex: body.questionType === "objective" ? body.correctIndex ?? 0 : null,
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
