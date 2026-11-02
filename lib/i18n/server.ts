import { adminDb } from "@/lib/firebase/admin";
import { DEFAULT_LANGUAGE, isLanguageCode, type LanguageCode } from "./languages";

const TTL_MS = 60_000;
const cache = new Map<string, { lang: LanguageCode; at: number }>();

/** The learner's chosen language (cached for a minute per server instance; English if unknown or unreadable). */
export async function getUserLanguage(uid: string): Promise<LanguageCode> {
  const hit = cache.get(uid);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.lang;
  let lang: LanguageCode = DEFAULT_LANGUAGE;
  try {
    const v = (await adminDb().collection("users").doc(uid).get()).data()?.language;
    if (isLanguageCode(v)) lang = v;
  } catch {
    // a lookup failure must never block an answer: fall back to English
  }
  cache.set(uid, { lang, at: Date.now() });
  if (cache.size > 5000) cache.delete(cache.keys().next().value as string);
  return lang;
}

/** Called when the learner changes language so this instance picks it up immediately. */
export function forgetUserLanguage(uid: string) {
  cache.delete(uid);
}
