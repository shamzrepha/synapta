import { generateGeminiVoice, hostFor, resetVoiceBreakers } from "./voice";
import { needsTranslation, type LanguageCode } from "@/lib/i18n/languages";
import { translateOne } from "@/lib/i18n/translate";
import { getCachedVoice, putCachedVoice, ttsKey } from "./tts-cache";

export interface HostLine {
  bytes: Buffer;
  mimeType: string;
  voiceName: string;
  cached: boolean;
}

/** One spoken podcast line: from the shared cache when anyone has played it before, otherwise synthesised and stored. */
export async function getOrSynthesizeHostLine(
  text: string,
  speaker: string,
  lang?: LanguageCode | null,
  forceRerecord = false
): Promise<HostLine | null> {
  const host = hostFor(speaker);
  let spokenText = text;
  let voiceLang = lang && lang !== "en" ? lang : null;
  if (voiceLang && needsTranslation(text, voiceLang)) {
    const translated = await translateOne(voiceLang, text);
    // never voice an English sentence as if it were Yorùbá/Igbo/Hausa (or cache it under that language):
    // when the translation isn't available, the line is spoken as written, in the original voice
    if (translated) spokenText = translated;
    else voiceLang = null;
  }
  // keyed by host slot + language + the words actually spoken, so older untranslated entries are bypassed
  const key = ttsKey(voiceLang ? `${host.slot}:${voiceLang}:v2` : host.slot, spokenText);
  if (!forceRerecord) {
    const hit = await getCachedVoice(key);
    if (hit) return { ...hit, cached: true };
  } else {
    resetVoiceBreakers();
  }
  const res = await generateGeminiVoice({ text: spokenText, speaker, lang: voiceLang });
  if (!res) return null;
  const voice = { bytes: Buffer.from(res.audioBase64, "base64"), mimeType: res.mimeType, voiceName: res.voiceName };
  await putCachedVoice(key, voice);
  return { ...voice, cached: false };
}
