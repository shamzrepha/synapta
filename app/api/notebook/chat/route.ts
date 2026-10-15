import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { generateWithFallback } from "@/lib/ai/router";
import { chunkText, retrieveRelevantChunks, TextChunk } from "@/lib/notebook/retrieval";
import { checkRateLimitAndQuota, recordTokenUsage, QuotaError } from "@/lib/quota/guard";
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

    const systemPrompt = `You are Sunroot's Source-Grounded Cognitive Synthesizer (NotebookLM style).
Your task is to answer the user's question STRICTLY and SOLELY using the Source Excerpts provided below.

RULES:
1. Every factual statement or definition MUST be immediately followed by its source citation tag in brackets, e.g. [S1] or [S2].
2. Do not include any knowledge outside the provided excerpts. If the excerpts do not contain the answer, explicitly say: "The provided source materials do not contain sufficient information to answer this question."
3. Use Markdown formatting and LaTeX notation for mathematical equations ($E = mc^2$ or $$...$$).
4. Be concise, structured, and insightful.

SOURCE EXCERPTS:
${contextText}`;

    // 4. Generate answer via generateWithFallback
    const conversationPrompt = history.length > 0
      ? `Prior conversation:\n${history.map((h) => `${h.role}: ${h.text}`).join("\n")}\n\nCurrent Question: ${query}`
      : query;

    const res = await generateWithFallback({
      task: "tutor_chat",
      userPrompt: conversationPrompt,
      systemInstruction: systemPrompt,
      userId: caller.uid,
    });

    const answerText = res.text || "";
    const tokensIn = res.tokensIn;
    const tokensOut = res.tokensOut;

    return NextResponse.json({
      ok: true,
      data: {
        answer: answerText,
        citations,
        tokensUsed: tokensIn + tokensOut,
      },
    });
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
