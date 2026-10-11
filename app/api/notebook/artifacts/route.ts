import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { getGeminiClient } from "@/lib/gemini/client";
import { getServerEnv } from "@/lib/env";
import { checkRateLimitAndQuota, recordTokenUsage, QuotaError } from "@/lib/quota/guard";
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

    const ai = getGeminiClient();

    if (type === "summary") {
      const prompt = `Synthesize a comprehensive, executive Study Guide strictly grounded in the source documents provided below.
Include:
1. Executive Abstract / Key Concepts
2. Core Definitions & Formal Theorems
3. Mathematical Formulas (rendered in LaTeX $...$ and $$...$$)
4. Critical Laboratory & Practical Takeaways

SOURCES:
${combinedSources}`;

      try {
        const response = await ai.models.generateContent({
          model: getServerEnv().GEMINI_MODEL,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: { temperature: 0.3 },
        });

        const markdown = response.text || "No response generated from model.";
        const tokensIn = response.usageMetadata?.promptTokenCount ?? Math.round(prompt.length / 4);
        const tokensOut = response.usageMetadata?.candidatesTokenCount ?? Math.round(markdown.length / 4);
        await recordTokenUsage(caller.uid, tokensIn, tokensOut);

        return NextResponse.json({
          ok: true,
          data: {
            type: "summary",
            markdown,
          },
        });
      } catch (err) {
        console.error("Artifact summary generation failed:", err);
        return NextResponse.json(
          { ok: false, error: { code: "GENERATION_FAILED", message: err instanceof Error ? err.message : "Failed to generate summary" } },
          { status: 502 }
        );
      }
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

      try {
        const response = await ai.models.generateContent({
          model: getServerEnv().GEMINI_MODEL,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        });

        const parsedJson = JSON.parse(response.text || "{}");
        if (!Array.isArray(parsedJson.cards) || parsedJson.cards.length === 0) {
          throw new Error("Model returned invalid or empty flashcards schema");
        }

        const tokensIn = response.usageMetadata?.promptTokenCount ?? Math.round(prompt.length / 4);
        const tokensOut = response.usageMetadata?.candidatesTokenCount ?? Math.round((response.text?.length || 0) / 4);
        await recordTokenUsage(caller.uid, tokensIn, tokensOut);

        return NextResponse.json({ ok: true, data: { type: "flashcards", cards: parsedJson.cards } });
      } catch (err) {
        console.error("Artifact flashcards generation failed:", err);
        return NextResponse.json(
          { ok: false, error: { code: "GENERATION_FAILED", message: err instanceof Error ? err.message : "Failed to generate flashcards" } },
          { status: 502 }
        );
      }
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

      try {
        const response = await ai.models.generateContent({
          model: getServerEnv().GEMINI_MODEL,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        });

        const parsedJson = JSON.parse(response.text || "{}");
        if (!Array.isArray(parsedJson.questions) || parsedJson.questions.length === 0) {
          throw new Error("Model returned invalid or empty quiz schema");
        }

        const tokensIn = response.usageMetadata?.promptTokenCount ?? Math.round(prompt.length / 4);
        const tokensOut = response.usageMetadata?.candidatesTokenCount ?? Math.round((response.text?.length || 0) / 4);
        await recordTokenUsage(caller.uid, tokensIn, tokensOut);

        return NextResponse.json({ ok: true, data: { type: "quiz", questions: parsedJson.questions } });
      } catch (err) {
        console.error("Artifact quiz generation failed:", err);
        return NextResponse.json(
          { ok: false, error: { code: "GENERATION_FAILED", message: err instanceof Error ? err.message : "Failed to generate quiz" } },
          { status: 502 }
        );
      }
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
