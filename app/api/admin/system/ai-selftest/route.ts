import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { generateWithFallback, resolveModelChain } from "@/lib/ai/router";
import { synthesizeEdgeVoice, synthesizeGeminiTts, geminiTtsModels } from "@/lib/ai/voice";
import { z } from "zod";
import { translateTexts } from "@/lib/i18n/translate";

export const runtime = "nodejs";
export const maxDuration = 120;

interface Check {
  name: string;
  ok: boolean;
  ms: number;
  detail: string;
  /** a short sample to listen to (data: URL) */
  audio?: string;
}

async function timed(name: string, fn: () => Promise<string | { detail: string; audio?: string }>): Promise<Check> {
  const t = Date.now();
  try {
    const r = await fn();
    const { detail, audio } = typeof r === "string" ? { detail: r, audio: undefined } : r;
    return { name, ok: true, ms: Date.now() - t, detail, audio };
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
    // Igbo end to end, as a podcast line is made: translation, then the native voice (Gemini) and the fallback
    // (free Nigerian English voice), with both recordings to listen to
    const sample = "Current is the flow of electric charge through a wire.";
    let igbo = "";
    const lang = [
      await timed("Igbo translation (podcast lines, notes)", async () => {
        igbo = (await translateTexts("ig", [sample])).get(sample) || "";
        if (!igbo || igbo === sample) throw new Error("No Igbo translation: the AI allowance may be used up, or the model is busy");
        return igbo;
      }),
    ];
    if (igbo && igbo !== sample) {
      lang.push(
        ...(await Promise.all([
          timed(`Igbo native voice: Gemini (${geminiTtsModels(true).join(" → ")})`, async () => {
            const r = await synthesizeGeminiTts(igbo, "Kore", 45_000, true);
            if (!r) throw new Error("No audio: Igbo podcasts fall back to the English-accented voice until this works (allowance, model access or timeout)");
            return { detail: `${r.mimeType}, ${Math.round((r.audioBase64.length * 0.75) / 1024)} KB`, audio: `data:${r.mimeType.split(";")[0]};base64,${r.audioBase64}` };
          }),
          timed("Igbo fallback voice: free Nigerian English voice", async () => {
            const mp3 = await synthesizeEdgeVoice(igbo, "en-NG-EzinneNeural", 15_000);
            if (!mp3) throw new Error("No audio within 15s");
            return { detail: `${Math.round(mp3.length / 1024)} KB MP3 (used only when Gemini fails)`, audio: `data:audio/mpeg;base64,${mp3.toString("base64")}` };
          }),
        ]))
      );
    }
    checks.push(...lang);
    return NextResponse.json({ ok: true, data: { checks, ranAt: new Date().toISOString() } });
  } catch (error) {
    return handleAuthError(error);
  }
}
