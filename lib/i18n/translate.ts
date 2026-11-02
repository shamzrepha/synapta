import crypto from "crypto";
import { z } from "zod";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { generateWithFallback } from "@/lib/ai/router";
import { languageInfo, type LanguageCode } from "./languages";

/**
 * Translation memory shared by the whole app: every piece of text is translated once per language and stored, so
 * a class read by forty Hausa-speaking students costs one translation, and a teacher's edit (new text) is
 * translated afresh on the next read while unchanged text stays instant. The teacher's original is always the
 * source; nothing here ever writes back to it.
 */

const COLLECTION = "translations";
/** strings per model call, and the characters a call may carry */
const BATCH_STRINGS = 40;
const BATCH_CHARS = 9_000;

export const textKey = (lang: LanguageCode, text: string) => `${lang}_${crypto.createHash("sha1").update(text).digest("hex")}`;

// ---------------------------------------------------------------------------
// Which strings are words for people (translate) and which are data (keep)
// ---------------------------------------------------------------------------

const KEEP_KEYS = /^(id|_id|uid|ids|hash|kind|type|status|level|representation|url|href|src|image|imageurl|videourl|thumbnail|path|mimetype|format|color|colour|icon|slug|key|unit|units|formula|latex|expression|expr|code|cppcode|sketch|blocks|spec|html|svg|css|js|script|language|lang|voice|voicestyle|voicename|speaker|role|engine|model|modelused|version|createdby|approvedby|ownerid|owneruid|teacherid|classid|kcid|topicid|labid|answerindex|correctindex|correctanswerindex|correctoption|seed|query|videoquery|searchquery|channelid|template|templateid|pin|pins|target|metric|testid|check|difficulty|focus|severity|priority|mode|state|variant|tag|tags|hashtag|handle|username|teachername|studentname|displayname|authorname|ownername)$/i;
const KEEP_KEY_SUFFIX = /(Id|Ids|Uid|Url|Urls|Path|At|Ms|Key|Hash|Code)$/;

/** Text worth translating: has letters, isn't an identifier, address, enum token, code or a whole HTML document. */
export function isTranslatable(value: string): boolean {
  const s = value.trim();
  if (s.length < 2 || !/\p{L}/u.test(s)) return false;
  if (/^(https?:|mailto:|data:|\/api\/|\/[a-z0-9_-]+\/)/i.test(s)) return false;
  if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(s)) return false;
  // enum-like tokens: multiple_choice, worked-example, kcId, ABC123
  if (!/\s/.test(s) && (/[_]/.test(s) || /^[a-z]+[A-Z]\w*$/.test(s) || /^[A-Z0-9_-]+$/.test(s) || /^[a-f0-9-]{16,}$/i.test(s))) return false;
  // a whole web page or program (AI simulations, sketches)
  if (s.length > 200 && /<(html|body|div|script|svg|canvas)\b/i.test(s)) return false;
  if (/^\s*(#include|void setup|function\s|const\s|let\s|import\s|<\?xml|<!doctype)/i.test(s)) return false;
  return true;
}

function keepKey(key: string): boolean {
  return KEEP_KEYS.test(key) || KEEP_KEY_SUFFIX.test(key);
}

/** Collects every translatable string in a JSON value (objects, arrays, strings), skipping data fields. */
export function collectStrings(value: unknown, out: Set<string> = new Set(), key = ""): Set<string> {
  if (typeof value === "string") {
    if (!keepKey(key) && isTranslatable(value)) out.add(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out, key);
  } else if (value && typeof value === "object" && !(value instanceof Date) && !isTimestampLike(value)) {
    for (const [k, v] of Object.entries(value)) if (!keepKey(k)) collectStrings(v, out, k);
  }
  return out;
}

/** Same shape as the input with every collected string swapped for its translation. */
export function applyStrings<T>(value: T, map: Map<string, string>, key = ""): T {
  if (typeof value === "string") return ((!keepKey(key) && map.get(value)) || value) as T;
  if (Array.isArray(value)) return value.map((v) => applyStrings(v, map, key)) as T;
  if (value && typeof value === "object" && !(value instanceof Date) && !isTimestampLike(value)) {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) o[k] = keepKey(k) ? v : applyStrings(v, map, k);
    return o as T;
  }
  return value;
}

function isTimestampLike(v: object): boolean {
  return typeof (v as { toMillis?: unknown }).toMillis === "function" || ("_seconds" in v && "_nanoseconds" in v);
}

// ---------------------------------------------------------------------------
// Translation memory + model calls
// ---------------------------------------------------------------------------

async function lookup(lang: LanguageCode, texts: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const refs = texts.map((t) => adminDb().collection(COLLECTION).doc(textKey(lang, t)));
  for (let i = 0; i < refs.length; i += 300) {
    const snaps = await adminDb().getAll(...refs.slice(i, i + 300));
    snaps.forEach((s, j) => {
      const t = s.data()?.t;
      if (s.exists && typeof t === "string") found.set(texts[i + j], t);
    });
  }
  return found;
}

async function remember(lang: LanguageCode, pairs: Array<[string, string]>) {
  for (let i = 0; i < pairs.length; i += 400) {
    const batch = adminDb().batch();
    for (const [src, t] of pairs.slice(i, i + 400)) {
      batch.set(adminDb().collection(COLLECTION).doc(textKey(lang, src)), { lang, t, chars: src.length, at: Timestamp.now() });
    }
    await batch.commit();
  }
}

function batches(texts: string[]): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  let chars = 0;
  for (const t of texts) {
    if (cur.length && (cur.length >= BATCH_STRINGS || chars + t.length > BATCH_CHARS)) {
      out.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(t);
    chars += t.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

const resultSchema = z.object({ translations: z.array(z.string()) });

async function translateBatch(lang: LanguageCode, texts: string[]): Promise<string[] | null> {
  const name = languageInfo(lang).name;
  const res = await generateWithFallback({
    task: "structured_spec",
    schema: resultSchema,
    temperature: 0.2,
    maxWaitMs: 20_000,
    systemInstruction: [
      `You translate learning material for students into ${name}.`,
      `Return JSON {"translations": [...]} with exactly ${texts.length} strings, in the same order as the input.`,
      "Translate meaning faithfully at the same reading level. Keep Markdown, LaTeX ($...$), code, numbers, units, chemical formulas, variable names and placeholders like {name} exactly as they are.",
      `Technical terms with no common ${name} word may stay in English. If a string is already in ${name}, return it unchanged.`,
      lang === "pcm" ? "Use natural, respectful Nigerian Pidgin as students speak it." : "",
    ].filter(Boolean).join(" "),
    userPrompt: JSON.stringify({ language: name, strings: texts }),
  });
  const list = res.data?.translations;
  return Array.isArray(list) && list.length === texts.length ? list : null;
}

/**
 * Translations for these strings, from memory where possible and from the model otherwise (then remembered).
 * A string that couldn't be translated is left out, so callers fall back to the original text.
 */
export async function translateTexts(lang: LanguageCode, texts: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(texts.filter((t) => t.trim())));
  if (!unique.length) return new Map();
  const found = await lookup(lang, unique).catch(() => new Map<string, string>());
  const missing = unique.filter((t) => !found.has(t));
  for (const group of batches(missing)) {
    const out = await translateBatch(lang, group).catch(() => null);
    if (!out) continue;
    const pairs = group.map((src, i) => [src, out[i]] as [string, string]).filter(([, t]) => t && t.trim());
    pairs.forEach(([src, t]) => found.set(src, t));
    await remember(lang, pairs).catch(() => null);
  }
  return found;
}

/** A copy of any JSON payload with its human-readable text in `lang` (callers skip it when no translation is needed). */
export async function localizeJson<T>(value: T, lang: LanguageCode): Promise<T> {
  const strings = Array.from(collectStrings(value));
  if (!strings.length) return value;
  const map = await translateTexts(lang, strings);
  return map.size ? applyStrings(value, map) : value;
}
