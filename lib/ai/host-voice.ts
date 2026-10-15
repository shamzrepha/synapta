import { generateGeminiVoice, hostFor } from "./voice";
import { getCachedVoice, putCachedVoice, ttsKey } from "./tts-cache";

export interface HostLine {
  bytes: Buffer;
  mimeType: string;
  voiceName: string;
  cached: boolean;
}

/** One spoken podcast line: from the shared cache when anyone has played it before, otherwise synthesised and stored. */
export async function getOrSynthesizeHostLine(text: string, speaker: string): Promise<HostLine | null> {
  const host = hostFor(speaker);
  const key = ttsKey(host.slot, text);
  const hit = await getCachedVoice(key);
  if (hit) return { ...hit, cached: true };
  const res = await generateGeminiVoice({ text, speaker });
  if (!res) return null;
  const voice = { bytes: Buffer.from(res.audioBase64, "base64"), mimeType: res.mimeType, voiceName: res.voiceName };
  await putCachedVoice(key, voice);
  return { ...voice, cached: false };
}
