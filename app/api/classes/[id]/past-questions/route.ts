import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { planOf } from "@/lib/billing/plans";
import { generateWithFallback } from "@/lib/ai/router";

export const runtime = "nodejs";
export const maxDuration = 60;

const solveSchema = z.object({
  questionId: z.string().min(1).max(100),
  questionText: z.string().trim().min(3).max(3000),
  courseCode: z.string().max(40).optional(),
});

/**
 * Past Questions API:
 * CACHE-FIRST: Pre-stored worked solutions, examiner traps and formula guides
 * are served directly from Firestore ($0 AI cost). AI is called ONLY on first un-cached solve.
 * Normal Plus subscribers and Exam Pass holders have full access; Free gets 1 preview question.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireUser(req);
    const { id: classId } = await params;

    // Get cached past questions for this class
    const snap = await adminDb().collection("classes").doc(classId).collection("pastQuestions").limit(50).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const userDoc = await adminDb().collection("users").doc(caller.uid).get();
    const userPlan = planOf(userDoc.data() || {});

    // Free users can only preview 1 question; Plus and Exam Pass get unlimited
    const isSubscriber = userPlan.id === "plus" || userPlan.id === "exam" || userPlan.id === "teacher" || caller.role === "admin";

    return NextResponse.json({
      ok: true,
      data: {
        items,
        isSubscriber,
        plan: userPlan.id,
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

    const docRef = adminDb().collection("classes").doc(classId).collection("pastQuestions").doc(body.questionId);
    const existing = await docRef.get();

    // 1. CACHE HIT: Return directly from database ($0 AI cost)
    if (existing.exists && existing.data()?.solution) {
      return NextResponse.json({
        ok: true,
        data: { id: existing.id, ...existing.data(), cached: true },
      });
    }

    // 2. Access check: is user allowed to generate/view full solution?
    const userDoc = await adminDb().collection("users").doc(caller.uid).get();
    const userPlan = planOf(userDoc.data() || {});
    const isSubscriber = userPlan.id === "plus" || userPlan.id === "exam" || userPlan.id === "teacher" || caller.role === "admin";

    // Count how many past questions this user has solved if free
    if (!isSubscriber) {
      const historySnap = await adminDb().collection("users").doc(caller.uid).collection("pastQuestionAttempts").limit(3).get();
      if (historySnap.size >= 1) {
        throw new ApiError(
          403,
          "SUBSCRIPTION_REQUIRED",
          "You've used your 1 free past question preview! Unlock unlimited past papers with the ₦1,500 Exam Pass or the All-Access Plus Pass."
        );
      }
    }

    // 3. FIRST-TIME GENERATION: Run AI solver once, cache permanently
    const systemPrompt = `You are Sprout, SunRoot's master university tutor.
Break down this Nigerian university examination past question step-by-step.
Output clean JSON matching:
{
  "keyPrinciple": "string (1-2 sentences on the underlying concept/theorem)",
  "formulas": ["string (key formulas required)"],
  "hints": ["string (step-by-step hint for students before revealing solution)"],
  "steps": [
    { "stepNumber": 1, "title": "string", "detail": "string with mathematical derivations" }
  ],
  "finalAnswer": "string (the clear final answer with units)",
  "examinerTraps": ["string (common mistakes students make on this exact question)"],
  "twinQuestion": {
    "question": "string (similar twin question with different numbers to practice)",
    "solution": "string (brief solution)"
  }
}`;

    const result = await generateWithFallback({
      task: "quiz_gen",
      systemInstruction: systemPrompt,
      userPrompt: `Course: ${body.courseCode || "University Course"}\nQuestion:\n${body.questionText}`,
      temperature: 0.3,
      userId: caller.uid,
    });

    const solutionData = result.data || {};

    const savedDoc = {
      questionId: body.questionId,
      questionText: body.questionText,
      courseCode: body.courseCode || "",
      solution: solutionData,
      generatedBy: caller.uid,
      createdAt: Timestamp.now(),
    };

    await docRef.set(savedDoc, { merge: true });

    // Track attempt for free usage limit
    await adminDb().collection("users").doc(caller.uid).collection("pastQuestionAttempts").add({
      classId,
      questionId: body.questionId,
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({
      ok: true,
      data: { id: body.questionId, ...savedDoc, cached: false },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
