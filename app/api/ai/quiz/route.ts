import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
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
    const lessonMarkdown = kcData.lessonMarkdown || kcData.description || "Lesson content";

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

    return NextResponse.json({
      ok: true,
      data: {
        questions: data.questions,
        tokensUsed: tokensIn + tokensOut,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
