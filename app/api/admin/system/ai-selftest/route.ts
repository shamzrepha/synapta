import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { generateWithFallback, resolveModelChain } from "@/lib/ai/router";
import { synthesizeEdgeVoice, synthesizeGeminiTts, geminiTtsModels } from "@/lib/ai/voice";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Check {
  name: string;
  ok: boolean;
  ms: number;
  detail: string;
}

async function timed(name: string, fn: () => Promise<string>): Promise<Check> {
  const t = Date.now();
  try {
    const detail = await fn();
    return { name, ok: true, ms: Date.now() - t, detail };
  } catch (e) {
    return { name, ok: false, ms: Date.now() - t, detail: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300) };
  }
}

/**
 * Admin-only live check of every AI path: text (tutor), structured JSON (quizzes, flashcards,
 * builds), and both voice engines. Runs once per click, so it costs a handful of requests.
 */
export async function POST(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
    const checks = await Promise.all([
      timed("Tutor / chat (light models)", async () => {
        const chain = await resolveModelChain("tutor_chat");
        const r = await generateWithFallback({
          task: "tutor_chat",
          contents: [{ role: "user", parts: [{ text: "In one short sentence: what is photosynthesis?" }] }],
          systemInstruction: "You are a concise tutor.",
          maxRetriesPerModel: 0,
        });
        if (!r.text.trim()) throw new Error("Empty reply");
        return `${r.modelUsed} answered (chain: ${chain.join(" → ")})`;
      }),
      timed("Structured JSON (quizzes, flashcards)", async () => {
        const r = await generateWithFallback({
          task: "structured_spec",
          userPrompt: 'Return JSON {"answer": number} for 6 times 7.',
          schema: z.object({ answer: z.number() }),
          maxRetriesPerModel: 0,
        });
        if (r.data?.answer !== 42) throw new Error(`Unexpected answer ${JSON.stringify(r.data)}`);
        return `${r.modelUsed} returned valid JSON`;
      }),
      timed("Class builds / simulations (heavy models)", async () => {
        const chain = await resolveModelChain("class_build");
        const r = await generateWithFallback({ task: "class_build", userPrompt: "Reply with the single word READY.", maxRetriesPerModel: 0 });
        if (!r.text.trim()) throw new Error("Empty reply");
        return `${r.modelUsed} answered${r.fallbackTriggered ? " (fell back)" : ""} (chain: ${chain.join(" → ")})`;
      }),
      timed("Free Edge voices (audio lessons, podcasts)", async () => {
        const mp3 = await synthesizeEdgeVoice("Testing the lesson voice.", "en-US-JennyNeural", 10_000);
        if (!mp3) throw new Error("No audio within 10s — Gemini TTS will be used instead, then the device voice");
        return `${Math.round(mp3.length / 1024)} KB MP3`;
      }),
      timed("Gemini TTS (voice fallback)", async () => {
        const r = await synthesizeGeminiTts("Testing the backup voice.", "Kore", 20_000);
        if (!r) throw new Error(`No audio from ${geminiTtsModels().join(", ")}`);
        return `${r.mimeType}, ${Math.round((r.audioBase64.length * 0.75) / 1024)} KB`;
      }),
    ]);
    return NextResponse.json({ ok: true, data: { checks, ranAt: new Date().toISOString() } });
  } catch (error) {
    return handleAuthError(error);
  }
}
