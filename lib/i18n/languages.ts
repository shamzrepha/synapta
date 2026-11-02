/**
 * Languages SunrootLearn speaks. The AI writes and explains in the learner's language, the microphone listens in it,
 * and spoken audio uses a matching neural voice. Igbo and Hausa have no free native voice, so they are spoken by
 * Gemini's speech model, which speaks both (`nativeGemini`), with the Nigerian English voices as the fallback. Yoruba
 * has no native voice in any engine we use yet, so it is read by the Nigerian English voices (`voiceBeta`).
 */
export type LanguageCode = "en" | "pcm" | "yo" | "ig" | "ha" | "fr" | "ar" | "sw";

export interface Language {
  code: LanguageCode;
  /** name in English, used in AI instructions */
  name: string;
  /** name in the language itself, shown in the picker */
  native: string;
  /** BCP 47 tag for the browser's speech recognition */
  speech: string;
  voices: { female: string; male: string };
  voiceBeta?: boolean;
  /** spoken natively by Gemini's speech model (the free voices have none for this language) */
  nativeGemini?: boolean;
  rtl?: boolean;
}

export const LANGUAGES: Language[] = [
  { code: "en", name: "English", native: "English", speech: "en-US", voices: { female: "en-US-AriaNeural", male: "en-US-AndrewMultilingualNeural" } },
  { code: "pcm", name: "Nigerian Pidgin", native: "Naijá (Pidgin)", speech: "en-NG", voices: { female: "en-NG-EzinneNeural", male: "en-NG-AbeoNeural" } },
  { code: "yo", name: "Yoruba", native: "Yorùbá", speech: "yo-NG", voices: { female: "en-NG-EzinneNeural", male: "en-NG-AbeoNeural" }, voiceBeta: true },
  { code: "ig", name: "Igbo", native: "Igbo", speech: "ig-NG", voices: { female: "en-NG-EzinneNeural", male: "en-NG-AbeoNeural" }, nativeGemini: true },
  { code: "ha", name: "Hausa", native: "Hausa", speech: "ha-NG", voices: { female: "en-NG-EzinneNeural", male: "en-NG-AbeoNeural" }, nativeGemini: true },
  { code: "fr", name: "French", native: "Français", speech: "fr-FR", voices: { female: "fr-FR-DeniseNeural", male: "fr-FR-HenriNeural" } },
  { code: "ar", name: "Arabic", native: "العربية", speech: "ar-SA", voices: { female: "ar-SA-ZariyahNeural", male: "ar-SA-HamedNeural" }, rtl: true },
  { code: "sw", name: "Swahili", native: "Kiswahili", speech: "sw-KE", voices: { female: "sw-KE-ZuriNeural", male: "sw-KE-RafikiNeural" } },
];

export const DEFAULT_LANGUAGE: LanguageCode = "en";
export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code) as [LanguageCode, ...LanguageCode[]];

export function isLanguageCode(v: unknown): v is LanguageCode {
  return typeof v === "string" && LANGUAGES.some((l) => l.code === v);
}

export function languageInfo(code: unknown): Language {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

/** True when this language is spoken by Gemini's speech model first (no free native voice exists for it). */
export function speaksWithGemini(code: unknown): boolean {
  return !!LANGUAGES.find((l) => l.code === code)?.nativeGemini;
}

/**
 * Added to every AI request made for a learner who chose another language. JSON keys, ids, enum values, code and
 * maths stay as specified so structured answers still parse and studio code still compiles.
 */
export function languageDirective(code: unknown): string {
  const lang = languageInfo(code);
  if (lang.code === "en") return "";
  return [
    `LANGUAGE: The learner's language is ${lang.name}. Write every human-readable word you produce (explanations, titles, summaries, questions, answer options, hints, feedback, dialogue and podcast lines) in ${lang.name}.`,
    `Keep JSON keys, IDs, enum values, programming code, formulas, chemical symbols and units exactly as specified; technical terms with no common ${lang.name} word may stay in English, briefly explained in ${lang.name}.`,
    lang.code === "pcm" ? "Use natural, respectful Nigerian Pidgin as spoken by students, not a caricature." : "",
  ].filter(Boolean).join(" ");
}

/**
 * Best guess of a text's language from its script and telltale letters, for picking a voice when the caller didn't
 * say. Only distinguishes what changes the voice: Arabic, French, Swahili, the Nigerian languages, else English.
 */
export function guessSpeechLanguage(text: string): LanguageCode | null {
  const t = text.slice(0, 800);
  if (/[؀-ۿ]/.test(t)) return "ar";
  if (/[ịụṅỊỤṄ]/.test(t)) return "ig";
  if (/[ẹọṣẸỌṢ]/.test(t)) return "yo";
  if (/[ɓɗƙƴƁƊƘ]/.test(t)) return "ha";
  const words = t.toLowerCase().match(/[a-zàâçéèêëîïôûùüÿœ']+/g) || [];
  if (words.length >= 6) {
    const count = (set: Set<string>) => words.filter((w) => set.has(w)).length / words.length;
    if (count(FR) > 0.12) return "fr";
    if (count(SW) > 0.12) return "sw";
  }
  return null;
}

const FR = new Set(["le", "la", "les", "des", "est", "et", "une", "un", "du", "que", "qui", "dans", "pour", "pas", "sur", "avec", "nous", "vous", "c'est", "ce", "sont"]);
const SW = new Set(["na", "ya", "wa", "kwa", "ni", "katika", "hii", "ambayo", "kuwa", "za", "la", "cha", "pia", "sana", "hivyo"]);

// words that are common in English prose but rare in Nigerian Pidgin, Yorùbá, Igbo, Hausa, French or Swahili
const EN = new Set(["the", "is", "are", "was", "were", "of", "that", "this", "these", "those", "with", "which", "have", "has", "will", "would", "an", "be", "been", "there", "their", "they", "it's", "it", "what", "when", "how", "into", "than", "then", "because", "can't", "don't"]);

/**
 * True when text reads as English prose (at least four words and a good share of English function words). Used to
 * decide whether text needs translating before it is voiced or shown in another language: Pidgin shares most of its
 * vocabulary with English, so "not obviously another language" is not enough.
 */
export function looksEnglish(text: string): boolean {
  const words = text.slice(0, 800).toLowerCase().match(/[a-z']+/g) || [];
  if (words.length < 4 || guessSpeechLanguage(text)) return false;
  return words.filter((w) => EN.has(w)).length / words.length >= 0.12;
}

/** Whether text in an unknown language should be translated before it is spoken or shown in `lang`. */
export function needsTranslation(text: string, lang: LanguageCode): boolean {
  if (lang === "en") return false;
  const guess = guessSpeechLanguage(text);
  return guess ? guess !== lang : looksEnglish(text);
}
