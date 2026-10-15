import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { loadKcGroundingContext } from "@/lib/kc/context";
import { checkRateLimitAndQuota, recordTokenUsage } from "@/lib/quota/guard";
import { generateStructuredJson } from "@/lib/gemini/client";
import { getFlashcardsPrompt } from "@/lib/gemini/prompts";
import { flashcardSchema, type Flashcard } from "@/lib/gemini/schemas";
import { z } from "zod";

export const runtime = "nodejs";

// Accept whatever number of valid cards the model returns instead of failing the whole deck
const lenientFlashcardsSchema = z.preprocess(
  (val) => (Array.isArray(val) ? { cards: val } : val),
  z.object({ cards: z.array(flashcardSchema).min(1).max(30) })
);

const flashcardsInputSchema = z.object({
  classId: z.string().min(1),
  kcId: z.string().min(1),
  count: z.number().int().min(1).max(15).default(10),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const body = await req.json();
    const parsed = flashcardsInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Invalid input" } },
        { status: 400 }
      );
    }

    const { classId, kcId, count } = parsed.data;

    // Verify caller has permission to view this class
    await assertClassAccess(caller, classId, "view");

    // Ground cards in the lesson AND the most relevant parts of the teacher's materials
    const ctx = await loadKcGroundingContext(classId, kcId);
    const kcTitle = ctx.kcTitle;
    const lessonMarkdown = ctx.contextText;

    // Rate limit and token quota check
    await checkRateLimitAndQuota(caller.uid, 1200);

    const { systemInstruction, userPrompt } = getFlashcardsPrompt({
      kcTitle,
      lessonMarkdown,
      count,
    });

    const { data, tokensIn, tokensOut } = await generateStructuredJson({
      systemInstruction,
      userPrompt,
      schema: lenientFlashcardsSchema as unknown as z.ZodType<{ cards: Flashcard[] }>,
    });

    // Record token usage
    await recordTokenUsage(caller.uid, tokensIn, tokensOut);

    return NextResponse.json({
      ok: true,
      data: {
        cards: data.cards,
        tokensUsed: tokensIn + tokensOut,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
