import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { getOrSynthesizeHostLine } from "@/lib/ai/host-voice";
import { checkRateLimit } from "@/lib/rateLimit";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  text: z.string().min(1).max(3000),
  speaker: z.string().default("Alex"),
  /** return raw audio bytes instead of base64 JSON (smaller and faster for the streaming player) */
  binary: z.boolean().default(false),
});

/**
 * One spoken line of a podcast. Lines are cached for everyone, so a script is voiced once no matter
 * how many learners play it. A male and a female voice are used for the two hosts in every engine.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "voice_line", limit: 90, windowMs: 60_000 });
    if (limited) return limited;
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "Provide text and a speaker." } }, { status: 400 });
    }
    const { text, speaker, binary } = parsed.data;
    const line = await getOrSynthesizeHostLine(text, speaker);

    if (binary) {
      if (!line) return NextResponse.json({ ok: false, error: { code: "NO_AUDIO", message: "Studio voice unavailable; use the device voice." } }, { status: 503 });
      return new NextResponse(new Uint8Array(line.bytes), {
        headers: { "Content-Type": line.mimeType, "Cache-Control": "private, max-age=86400", "X-Voice": line.voiceName, "X-Voice-Cached": line.cached ? "1" : "0" },
      });
    }
    if (!line) {
      return NextResponse.json({ ok: true, data: { audioBase64: null, fallbackToBrowser: true, message: "Studio voice audio unavailable; using the device voice." } });
    }
    return NextResponse.json({ ok: true, data: { audioBase64: line.bytes.toString("base64"), mimeType: line.mimeType, voiceName: line.voiceName, fallbackToBrowser: false, cached: line.cached } });
  } catch (error) {
    return handleAuthError(error);
  }
}
