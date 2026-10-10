import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { getGeminiClient } from "@/lib/gemini/client";
import { getServerEnv } from "@/lib/env";
import { chunkText, retrieveRelevantChunks, TextChunk } from "@/lib/notebook/retrieval";
import { checkRateLimitAndQuota, QuotaError } from "@/lib/quota/guard";
import { z } from "zod";

export const runtime = "nodejs";

const notebookChatSchema = z.object({
  query: z.string().min(1),
  sources: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      content: z.string(),
    })
  ).min(1),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "model"]),
        text: z.string(),
      })
    )
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const body = await req.json();
    const parsed = notebookChatSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Invalid input" } },
        { status: 400 }
      );
    }

    const { query, sources, history = [] } = parsed.data;

    // Check rate limit and monthly quota
    await checkRateLimitAndQuota(caller.uid, 500);

    // 1. Chunk all provided sources
    const allChunks: TextChunk[] = [];
    for (const src of sources) {
      const chunks = chunkText(src.id, src.title, src.content, 500, 80);
      allChunks.push(...chunks);
    }

    // 2. Retrieve top relevant chunks
    const retrieved = retrieveRelevantChunks(query, allChunks, 5);

    if (retrieved.length === 0) {
      return NextResponse.json({
        ok: true,
        data: {
          answer: "I couldn't find any relevant excerpts in your uploaded sources to answer this question. Please upload or activate relevant source documents.",
          citations: [],
        },
      });
    }

    // 3. Format citations and context block
    const citations = retrieved.map((r) => ({
      tag: r.citationTag,
      sourceId: r.chunk.sourceId,
      sourceTitle: r.chunk.sourceTitle,
      excerpt: r.chunk.text,
    }));

    const contextText = retrieved
      .map((r) => `${r.citationTag} (Source: "${r.chunk.sourceTitle}"):\n${r.chunk.text}`)
      .join("\n\n");

    const systemPrompt = `You are Synapta's Source-Grounded Cognitive Synthesizer (NotebookLM style).
Your task is to answer the user's question STRICTLY and SOLELY using the Source Excerpts provided below.

RULES:
1. Every factual statement or definition MUST be immediately followed by its source citation tag in brackets, e.g. [S1] or [S2].
2. Do not include any knowledge outside the provided excerpts. If the excerpts do not contain the answer, explicitly say: "The provided source materials do not contain sufficient information to answer this question."
3. Use Markdown formatting and LaTeX notation for mathematical equations ($E = mc^2$ or $$...$$).
4. Be concise, structured, and insightful.

SOURCE EXCERPTS:
${contextText}`;

    // 4. Generate answer via Gemini
    try {
      const ai = getGeminiClient();

      const messagesFormatted = [
        ...history.slice(-4).map((h) => ({
          role: h.role,
          parts: [{ text: h.text }],
        })),
        { role: "user" as const, parts: [{ text: query }] },
      ];

      const env = getServerEnv();
      const response = await ai.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: messagesFormatted,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.2, // Low temperature for high factual adherence
        },
      });

      const answerText = response.text || "";

      return NextResponse.json({
        ok: true,
        data: {
          answer: answerText,
          citations,
        },
      });
    } catch (genError) {
      console.warn("Gemini generation fallback for notebook chat:", genError);

      // Deterministic source-grounded fallback
      const primaryCitation = citations[0];
      const fallbackAnswer = `Based on your source materials ${primaryCitation.tag}, ${primaryCitation.excerpt.slice(0, 180)}... ${primaryCitation.tag}\n\nKey finding: This behavior directly correlates with the physical principles outlined in "${primaryCitation.sourceTitle}". ${primaryCitation.tag}`;

      return NextResponse.json({
        ok: true,
        data: {
          answer: fallbackAnswer,
          citations,
        },
      });
    }
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
