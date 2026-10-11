import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { generateWithFallback } from "@/lib/ai/router";
import { checkRateLimitAndQuota, recordTokenUsage, QuotaError } from "@/lib/quota/guard";
import { z } from "zod";

export const runtime = "nodejs";

const discussionInputSchema = z.object({
  sources: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      content: z.string(),
    })
  ).min(1),
  topic: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const body = await req.json();
    const parsed = discussionInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Invalid input" } },
        { status: 400 }
      );
    }

    const { sources, topic } = parsed.data;

    await checkRateLimitAndQuota(caller.uid, 600);

    // Combine sources into concise context (first ~4000 characters to stay within context bounds)
    const combinedSources = sources
      .map((s) => `--- SOURCE: ${s.title} ---\n${s.content.slice(0, 2000)}`)
      .join("\n\n");

    const prompt = `Produce an engaging 2-host "Deep Dive" conversational audio discussion based on the sources provided.

HOST PROFILES:
- Alex: An inquisitive, intuitive guide who frames the big picture, asks sharp questions, and keeps the listener oriented.
- Sam: A technical synthesizer and deep diver who explains the underlying mechanisms, math, and analogies.

SPECIFICATIONS:
1. Ground the discussion strictly in the source materials provided.
2. Produce 8 to 12 conversational turns alternating naturally between Alex and Sam.
3. Keep the tone dynamic, intellectually curious, and lucid.
4. Output strict JSON matching the schema below:

{
  "title": "Deep Dive: [Focus Topic]",
  "overview": "Brief 1-sentence summary of the episode",
  "dialogue": [
    { "speaker": "Alex", "text": "..." },
    { "speaker": "Sam", "text": "..." }
  ]
}

SOURCES:
${combinedSources}`;

    const discussionSchema = z.object({
      title: z.string(),
      overview: z.string(),
      dialogue: z.array(
        z.object({
          speaker: z.string(),
          text: z.string(),
        })
      ).min(1),
    });

    const res = await generateWithFallback({
      task: "structured_spec",
      userPrompt: prompt,
      schema: discussionSchema,
      userId: caller.uid,
    });

    return NextResponse.json({
      ok: true,
      data: res.data,
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
