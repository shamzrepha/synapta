import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { synthesizeEdgeWithWords } from "@/lib/ai/voice";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Sprout's reading voice: Ana, the Edge child voice, lifted high in pitch so it sounds like a small girl of about three. No effect is added in the browser. */
const READ_VOICE = process.env.SPROUT_READ_VOICE || "en-US-AnaNeural";

/**
 * Reads a passage of notes aloud in Sprout's voice and says when each word is spoken, so the page can light the word and Sprout can
 * stand on it. Natural studio voices are kept for the podcast. If the voice is busy the client falls back to the normal reader.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "tts_read", limit: 60, windowMs: 60_000 });
    if (limited) return limited;
    const { text } = await parseJson(req, z.object({ text: z.string().trim().min(1).max(700) }));
    const out = await synthesizeEdgeWithWords(text, READ_VOICE, { rate: "+0%", pitch: "+45Hz" });
    if (!out) return NextResponse.json({ ok: false, error: { code: "TTS_UNAVAILABLE", message: "Sprout's voice is busy right now." } }, { status: 503 });
    return NextResponse.json({ ok: true, data: { audioBase64: out.audio.toString("base64"), mimeType: "audio/mpeg", words: out.words, estimated: out.estimated } }, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (error) {
    return handleAuthError(error);
  }
}
