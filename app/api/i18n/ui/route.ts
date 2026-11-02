import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { LANGUAGE_CODES } from "@/lib/i18n/languages";
import { translateTexts } from "@/lib/i18n/translate";
import { isUiText } from "@/lib/i18n/dom";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  lang: z.enum(LANGUAGE_CODES),
  texts: z.array(z.string().max(1500)).min(1).max(60),
});

/**
 * Interface text in the learner's language. Each phrase is translated once per language for the whole app and
 * remembered, so this mostly reads the shared translation memory. Works signed out too (sign-in and landing pages),
 * with a tighter limit.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req).catch(() => null);
    const limited = await checkRateLimit(req, { uid: caller?.uid, keyPrefix: "i18n_ui", limit: caller ? 60 : 15, windowMs: 60_000, shared: true });
    if (limited) return limited;
    const { lang, texts } = await parseJson(req, schema);
    const wanted = lang === "en" ? [] : Array.from(new Set(texts.map((t) => t.trim()).filter(isUiText)));
    const map = await translateTexts(lang, wanted);
    return NextResponse.json({ ok: true, data: { translations: Object.fromEntries(map) } });
  } catch (error) {
    return handleAuthError(error);
  }
}
