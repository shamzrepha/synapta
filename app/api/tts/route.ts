import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { synthesizeSpeech } from "@/lib/ai/voice";
import { isLanguageCode, needsTranslation } from "@/lib/i18n/languages";
import { getUserLanguage } from "@/lib/i18n/server";
import { translateOne } from "@/lib/i18n/translate";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Speaks a short piece of text (the tutor's answer, a "Listen" button) with a real neural voice — never the browser's robot voice. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "tts", limit: 40, windowMs: 60_000 });
    if (limited) return limited;
    const { text, voice, lang, reader } = await parseJson(
      req,
      z.object({ text: z.string().trim().min(1).max(1200), voice: z.enum(["female", "male"]).optional(), lang: z.string().optional(), reader: z.boolean().optional() })
    );
    const targetLang = isLanguageCode(lang) ? lang : await getUserLanguage(caller.uid);
    // text from the app is usually already in the listener's language (the tutor answers in it); only English
    // (or another language's) text is translated first, and if that fails it is read as written
    let spokenText = text;
    let voiceLang = targetLang;
    if (needsTranslation(text, targetLang)) {
      const translated = await translateOne(targetLang, text);
      if (translated) spokenText = translated;
      else voiceLang = "en";
    }
    const clip = await synthesizeSpeech(spokenText, voice ?? "female", undefined, { lang: voiceLang, edgeFirst: reader === true });
    if (!clip) return NextResponse.json({ ok: false, error: { code: "TTS_UNAVAILABLE", message: "The voice is busy right now. Try again in a moment." } }, { status: 503 });
    return new NextResponse(new Uint8Array(clip.audio), {
      headers: { "Content-Type": clip.mimeType, "Content-Length": String(clip.audio.length), "Cache-Control": "private, max-age=3600" },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
