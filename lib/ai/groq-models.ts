/**
 * Which Groq models to use. Groq retires and renames models, and not every account can use every model, so nothing here
 * assumes a model exists: we ask Groq which models the key can use, prefer the best ones we know, and skip any that fail.
 */
const HEAVY_PREFERENCE = [
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-120b",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "qwen/qwen3-32b",
  "moonshotai/kimi-k2-instruct",
  "llama-3.1-70b-versatile",
];
const LIGHT_PREFERENCE = [
  "llama-3.1-8b-instant",
  "openai/gpt-oss-20b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "gemma2-9b-it",
  "llama-3.3-70b-versatile",
];
/** Models that are not chat models (speech, safety filters, embeddings): never pick these to answer a question. */
const NOT_CHAT = /whisper|guard|tts|orpheus|playai|embed|moderation|safeguard|transcri/i;
const HEAVY_HINT = /70b|120b|maverick|versatile|32b|kimi/i;
const MAX_ATTEMPTS = 4;

export const isHeavyModelName = (model?: string): boolean => !!model && HEAVY_HINT.test(model);

/** The models to try, best first. With no list from Groq (the call failed), the known preferences are tried blind. */
export function pickGroqModels(available: string[] | null, heavy: boolean, requested?: string, skip: ReadonlySet<string> = new Set()): string[] {
  const first = heavy ? HEAVY_PREFERENCE : LIGHT_PREFERENCE;
  const second = heavy ? LIGHT_PREFERENCE : HEAVY_PREFERENCE;
  const usable = (available ?? []).filter((m) => !NOT_CHAT.test(m));
  const has = (m: string) => (available === null || available.length === 0 ? true : usable.includes(m));
  const ordered: string[] = [];
  const add = (m: string) => {
    if (m && !ordered.includes(m) && !skip.has(m)) ordered.push(m);
  };
  if (requested && has(requested) && !NOT_CHAT.test(requested)) add(requested);
  first.filter(has).forEach(add);
  second.filter(has).forEach(add);
  if (available && available.length > 0) usable.forEach(add);
  return ordered.slice(0, MAX_ATTEMPTS);
}

/** True when Groq is saying "that model isn't available to you", as opposed to a real problem with the request or the key. */
export function isModelUnavailable(status: number, message: string): boolean {
  if (status === 404) return true;
  return /does not exist|do not have access|not found|decommission|deprecated|no longer supported|model_not_found/i.test(message);
}

/** The model ids out of Groq's /models answer. */
export function parseModelList(json: unknown): string[] {
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  return data.map((m) => (m as { id?: unknown })?.id).filter((id): id is string => typeof id === "string" && id.length > 0);
}
