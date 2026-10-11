import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { generateWithFallback } from "@/lib/ai/router";
import { checkRateLimitAndQuota, QuotaError } from "@/lib/quota/guard";
import { z } from "zod";

export const runtime = "nodejs";

const artifactInputSchema = z.object({
  sources: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      content: z.string(),
    })
  ).min(1),
  type: z.enum(["summary", "flashcards", "quiz"]),
});

const flashcardsSchema = z.object({
  cards: z.array(
    z.object({
      front: z.string(),
      back: z.string(),
    })
  ).min(1),
});

const quizSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.string()),
      correctIndex: z.number(),
      explanation: z.string(),
    })
  ).min(1),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const body = await req.json();
    const parsed = artifactInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Invalid input" } },
        { status: 400 }
      );
    }

    const { sources, type } = parsed.data;

    await checkRateLimitAndQuota(caller.uid, 500);

    const combinedSources = sources
      .map((s) => `--- SOURCE: ${s.title} ---\n${s.content.slice(0, 2500)}`)
      .join("\n\n");

    if (type === "summary") {
      const prompt = `Synthesize a comprehensive, executive Study Guide strictly grounded in the source documents provided below.
Include:
1. Executive Abstract / Key Concepts
2. Core Definitions & Formal Theorems
3. Mathematical Formulas (rendered in LaTeX $...$ and $$...$$)
4. Critical Laboratory & Practical Takeaways

SOURCES:
${combinedSources}`;

      const res = await generateWithFallback({
        task: "long_document",
        userPrompt: prompt,
        userId: caller.uid,
      });

      return NextResponse.json({
        ok: true,
        data: {
          type: "summary",
          markdown: res.text || "No response generated from model.",
        },
      });
    }

    if (type === "flashcards") {
      const prompt = `Generate 5 active recall flashcards strictly grounded in the source documents. Output strict JSON:
{
  "cards": [
    { "front": "Question / Prompt", "back": "Accurate, concise answer" }
  ]
}

SOURCES:
${combinedSources}`;

      const res = await generateWithFallback({
        task: "structured_spec",
        userPrompt: prompt,
        schema: flashcardsSchema,
        userId: caller.uid,
      });

      return NextResponse.json({
        ok: true,
        data: {
          type: "flashcards",
          cards: res.data?.cards || [],
        },
      });
    }

    if (type === "quiz") {
      const prompt = `Generate a 4-question conceptual quiz strictly grounded in the source documents. Output strict JSON:
{
  "questions": [
    {
      "question": "Clear conceptual question",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Explanation citing source principles"
    }
  ]
}

SOURCES:
${combinedSources}`;

      const res = await generateWithFallback({
        task: "structured_spec",
        userPrompt: prompt,
        schema: quizSchema,
        userId: caller.uid,
      });

      return NextResponse.json({
        ok: true,
        data: {
          type: "quiz",
          questions: res.data?.questions || [],
        },
      });
    }

    return NextResponse.json({ ok: false, error: { code: "INVALID_TYPE", message: "Unsupported artifact type" } }, { status: 400 });
  } catch (error) {
    if (error instanceof QuotaError) {
      return NextResponse.json(
        { ok: false, error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    }
    return handleAuthError(error);
  }
}
