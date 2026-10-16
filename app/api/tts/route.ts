import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { synthesizeSpeech } from "@/lib/ai/voice";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Speaks a short piece of text (the tutor's answer, a "Listen" button) with a real neural voice — never the browser's robot voice. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "tts", limit: 40, windowMs: 60_000 });
    if (limited) return limited;
    const { text, voice } = await parseJson(req, z.object({ text: z.string().trim().min(1).max(1200), voice: z.enum(["female", "male"]).optional() }));
    const clip = await synthesizeSpeech(text, voice ?? "female");
    if (!clip) return NextResponse.json({ ok: false, error: { code: "TTS_UNAVAILABLE", message: "The voice is busy right now. Try again in a moment." } }, { status: 503 });
    return new NextResponse(new Uint8Array(clip.audio), {
      headers: { "Content-Type": clip.mimeType, "Content-Length": String(clip.audio.length), "Cache-Control": "private, max-age=3600" },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
