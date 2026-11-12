import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { checkRateLimit } from "@/lib/rateLimit";
import { transcribeAudioWithGroq } from "@/lib/ai/groq";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Cloud Speech-to-Text fallback powered by Groq Whisper.
 * Accepts multipart form data with an `audio` file and returns `{ text }`.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, {
      keyPrefix: "stt",
      limit: 15,
      windowMs: 60_000,
      uid: caller.uid,
      shared: true,
    });
    if (limited) return limited;

    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: "Expected multipart form data" } },
        { status: 400 },
      );
    }

    const file = form.get("audio");
    if (!(file instanceof Blob) || file.size === 0) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: "Audio recording is missing or empty" } },
        { status: 400 },
      );
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { ok: false, error: { code: "PAYLOAD_TOO_LARGE", message: "Audio clip exceeds 5 MB limit" } },
        { status: 413 },
      );
    }

    const langField = form.get("language");
    const language = typeof langField === "string" ? langField.trim() : undefined;
    const filename =
      "name" in file && typeof (file as File).name === "string" && (file as File).name
        ? (file as File).name
        : "speech.webm";

    try {
      const text = await transcribeAudioWithGroq(file, { filename, language });
      return NextResponse.json({ ok: true, data: { text } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Speech recognition unavailable";
      const status = message.includes("no Groq API key") ? 503 : 502;
      return NextResponse.json(
        { ok: false, error: { code: "STT_UNAVAILABLE", message } },
        { status },
      );
    }
  } catch (error) {
    return handleAuthError(error);
  }
}
