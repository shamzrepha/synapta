import { generateGeminiVoice, hostFor } from "./voice";
import type { LanguageCode } from "@/lib/i18n/languages";
import { getCachedVoice, putCachedVoice, ttsKey } from "./tts-cache";

export interface HostLine {
  bytes: Buffer;
  mimeType: string;
  voiceName: string;
  cached: boolean;
}

/** One spoken podcast line: from the shared cache when anyone has played it before, otherwise synthesised and stored. */
export async function getOrSynthesizeHostLine(text: string, speaker: string, lang?: LanguageCode | null): Promise<HostLine | null> {
  const host = hostFor(speaker);
  // the same words in Pidgin and English look alike, so the listener's language is part of the cache key
  const key = ttsKey(lang && lang !== "en" ? `${host.slot}:${lang}` : host.slot, text);
  const hit = await getCachedVoice(key);
  if (hit) return { ...hit, cached: true };
  const res = await generateGeminiVoice({ text, speaker, lang });
  if (!res) return null;
  const voice = { bytes: Buffer.from(res.audioBase64, "base64"), mimeType: res.mimeType, voiceName: res.voiceName };
  await putCachedVoice(key, voice);
  return { ...voice, cached: false };
}
