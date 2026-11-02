import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { getOrSynthesizeHostLine } from "@/lib/ai/host-voice";
import { isLanguageCode } from "@/lib/i18n/languages";
import { getUserLanguage } from "@/lib/i18n/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  text: z.string().min(1).max(3000),
  speaker: z.string().default("Alex"),
  /** return raw audio bytes instead of base64 JSON (smaller and faster for the streaming player) */
  binary: z.boolean().default(false),
  lang: z.string().optional(),
  rerecord: z.boolean().optional().default(false),
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
    const { text, speaker, binary, lang, rerecord } = parsed.data;
    if (rerecord) {
      // re-recording skips the shared cache, so it is held to a much tighter budget than normal playback
      const tooMany = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "voice_rerecord", limit: 60, windowMs: 10 * 60_000 });
      if (tooMany) return tooMany;
    }
    const targetLang = isLanguageCode(lang) ? lang : await getUserLanguage(caller.uid);
    // the listener's language picks the voice (Pidgin reads like English, so it can't be guessed from the text)
    const line = await getOrSynthesizeHostLine(text, speaker, targetLang, rerecord);

    if (binary) {
      if (!line) return NextResponse.json({ ok: false, error: { code: "NO_AUDIO", message: "Studio voice unavailable; try again." } }, { status: 503, headers: { "Cache-Control": "no-store" } });
      return new NextResponse(new Uint8Array(line.bytes), {
        headers: { "Content-Type": line.mimeType, "Cache-Control": rerecord ? "no-store" : "private, max-age=86400", "X-Voice": line.voiceName, "X-Voice-Cached": line.cached ? "1" : "0" },
      });
    }
    if (!line) {
      return NextResponse.json({ ok: true, data: { audioBase64: null, fallbackToBrowser: false, message: "Studio voice audio unavailable right now." } });
    }
    return NextResponse.json({ ok: true, data: { audioBase64: line.bytes.toString("base64"), mimeType: line.mimeType, voiceName: line.voiceName, fallbackToBrowser: false, cached: line.cached } });
  } catch (error) {
    return handleAuthError(error);
  }
}
