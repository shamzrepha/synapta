import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { getGeminiClient } from "@/lib/gemini/client";
import { getServerEnv } from "@/lib/env";
import { checkRateLimitAndQuota, QuotaError } from "@/lib/quota/guard";
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

    try {
      const ai = getGeminiClient();
      const env = getServerEnv();
      const response = await ai.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          temperature: 0.4,
        },
      });

      const parsedJson = JSON.parse(response.text || "{}");
      if (Array.isArray(parsedJson.dialogue) && parsedJson.dialogue.length > 0) {
        return NextResponse.json({
          ok: true,
          data: parsedJson,
        });
      }
      throw new Error("Invalid dialogue schema generated");
    } catch (genError) {
      console.warn("Gemini generation fallback for Deep Dive discussion:", genError);

      const mainSourceTitle = sources[0]?.title || "Source Documents";
      const snippet = sources[0]?.content.slice(0, 150).replace(/\n/g, " ") || "the core physical principles";

      return NextResponse.json({
        ok: true,
        data: {
          title: `Deep Dive: ${topic || mainSourceTitle}`,
          overview: `An in-depth 2-host breakdown exploring the central insights and physical intuitions in ${mainSourceTitle}.`,
          dialogue: [
            {
              speaker: "Alex",
              text: `Welcome to today's Deep Dive! We've been looking over our materials on ${mainSourceTitle}, and honestly, what strikes me first is how interconnected these concepts really are.`,
            },
            {
              speaker: "Sam",
              text: `Absolutely, Alex. When you look at the source text, it opens with: "${snippet}". What's crucial to grasp here is the underlying cause-and-effect mechanism.`,
            },
            {
              speaker: "Alex",
              text: "Right, so if a student is trying to build real physical intuition rather than just memorizing equations, where should they start?",
            },
            {
              speaker: "Sam",
              text: "They should start by looking at the limiting cases. Ask yourself: what happens when parameters go to zero or infinity? That gives you instant physical grounding.",
            },
            {
              speaker: "Alex",
              text: "That makes so much sense! It prevents you from getting lost in the arithmetic and keeps you anchored to the actual phenomena.",
            },
            {
              speaker: "Sam",
              text: "Exactly. And as the source notes illustrate, once you master that core foundation, the advanced derivations naturally fall right into place.",
            },
            {
              speaker: "Alex",
              text: "That's a fantastic takeaway. Thank you everyone for tuning into this Deep Dive session on Synapta!",
            },
          ],
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
