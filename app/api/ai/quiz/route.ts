import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { checkRateLimitAndQuota, recordTokenUsage } from "@/lib/quota/guard";
import { generateStructuredJson } from "@/lib/gemini/client";
import { getQuizPrompt } from "@/lib/gemini/prompts";
import { quizResponseSchema } from "@/lib/gemini/schemas";
import { z } from "zod";

export const runtime = "nodejs";

const quizInputSchema = z.object({
  classId: z.string().min(1),
  kcId: z.string().min(1),
  count: z.number().int().min(1).max(10).default(5),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const body = await req.json();
    const parsed = quizInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Invalid input" } },
        { status: 400 }
      );
    }

    const { classId, kcId, count } = parsed.data;

    // Verify caller has permission to view this class
    await assertClassAccess(caller, classId, "view");

    // Load KC from Firestore
    const kcRef = adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId);
    const kcDoc = await kcRef.get();
    if (!kcDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Knowledge Component not found" } },
        { status: 404 }
      );
    }

    const kcData = kcDoc.data()!;
    const kcTitle = kcData.title || "Topic";
    const objectivesText = Array.isArray(kcData.objectives) && kcData.objectives.length > 0
      ? `\nKey Objectives:\n${kcData.objectives.map((o: string) => `- ${o}`).join("\n")}`
      : "";
    let lessonMarkdown = kcData.lessonMarkdown || kcData.description || "";
    
    // If lesson is short or empty, pull excerpt from uploaded class materials to give Gemini deep context
    if (lessonMarkdown.length < 200) {
      const matSnap = await adminDb()
        .collection("classes")
        .doc(classId)
        .collection("materials")
        .limit(3)
        .get()
        .catch(() => null);
      
      const excerpts = (matSnap?.docs || [])
        .map((d) => (d.data() as { extractedText?: string })?.extractedText)
        .filter((t): t is string => typeof t === "string" && t.length > 0)
        .map((t) => t.slice(0, 1500))
        .join("\n\n---\n\n");

      lessonMarkdown = [
        `Topic: ${kcTitle}`,
        kcData.description ? `Description: ${kcData.description}` : "",
        objectivesText,
        excerpts ? `Reference Notes from Uploaded Materials:\n${excerpts}` : "",
        lessonMarkdown ? `Lesson Notes:\n${lessonMarkdown}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
    } else if (objectivesText) {
      lessonMarkdown = `${lessonMarkdown}\n${objectivesText}`;
    }

    // Rate limit and token quota check
    await checkRateLimitAndQuota(caller.uid, 1500);

    const { systemInstruction, userPrompt } = getQuizPrompt({
      kcTitle,
      lessonMarkdown,
      count,
    });

    const { data, tokensIn, tokensOut } = await generateStructuredJson({
      systemInstruction,
      userPrompt,
      schema: quizResponseSchema,
    });

    // Record token usage
    await recordTokenUsage(caller.uid, tokensIn, tokensOut);

    // Create secure server-side quiz session
    const sessionRef = adminDb().collection("quizSessions").doc();
    await sessionRef.set({
      sessionId: sessionRef.id,
      uid: caller.uid,
      classId,
      kcId,
      questions: data.questions, // contains question, options, correctIndex, explanation, difficulty
      answered: {},
      createdAt: adminDb() ? new Date() : null,
    });

    // Strip answers from client payload for server-side evaluation
    const clientQuestions = data.questions.map((q, idx) => ({
      id: idx,
      question: q.question,
      options: q.options,
      difficulty: q.difficulty,
    }));

    return NextResponse.json({
      ok: true,
      data: {
        sessionId: sessionRef.id,
        questions: clientQuestions,
        tokensUsed: tokensIn + tokensOut,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
