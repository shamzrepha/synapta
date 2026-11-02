import { generateGeminiVoice, hostFor, resetVoiceBreakers } from "./voice";
import { guessSpeechLanguage, type LanguageCode } from "@/lib/i18n/languages";
import { localizeJson } from "@/lib/i18n/translate";
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
  if (lang && lang !== "en") {
    const detected = guessSpeechLanguage(text);
    if (detected !== lang) {
      spokenText = (await localizeJson({ text }, lang).catch(() => ({ text }))).text;
      // Never voice untranslated English sentences and cache them as Yoruba/Igbo/Hausa/etc.
      if (spokenText.trim().toLowerCase() === text.trim().toLowerCase() && text.trim().split(/\s+/).length >= 4) {
        return null;
      }
    }
  }
  // Key by host slot + language + the actual translated text so any older untranslated cache entries are bypassed
  const key = ttsKey(lang && lang !== "en" ? `${host.slot}:${lang}:v2` : host.slot, spokenText);
  if (!forceRerecord) {
    const hit = await getCachedVoice(key);
    if (hit) return { ...hit, cached: true };
  } else {
    resetVoiceBreakers();
  }
  const res = await generateGeminiVoice({ text: spokenText, speaker, lang });
  if (!res) return null;
  const voice = { bytes: Buffer.from(res.audioBase64, "base64"), mimeType: res.mimeType, voiceName: res.voiceName };
  await putCachedVoice(key, voice);
  return { ...voice, cached: false };
}
