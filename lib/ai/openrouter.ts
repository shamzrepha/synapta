import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { cleanApiKey } from "@/lib/ai/api-key";

/**
 * OpenRouter: one account and one key that reach Claude, DeepSeek, Qwen, GPT, Llama, Mistral, Gemini and many text-to-speech voices,
 * priced per use. It speaks the same chat format as OpenAI, so this is a small client. The key is the admin's (Firestore
 * `secrets/openrouter`, or the OPENROUTER_API_KEY environment variable) and is never sent to the browser.
 */
const BASE = "https://openrouter.ai/api/v1";
const SECRET_DOC = () => adminDb().collection("secrets").doc("openrouter");
const TTL_MS = 60_000;

let cachedKey: string | null = null;
let checkedAt = 0;
let refreshing: Promise<void> | null = null;

export interface OpenRouterKeyInfo {
  source: "admin" | "environment" | "none";
  last4: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export const looksLikeOpenRouterKey = (key: string): boolean => {
  const k = cleanApiKey(key);
  return k.startsWith("sk-or-") && k.length >= 20 && !/\s/.test(k);
};

export function activeOpenRouterKey(): string {
  if (Date.now() - checkedAt > TTL_MS) void refreshOpenRouterKey();
  return cachedKey || process.env.OPENROUTER_API_KEY || "";
}

export function refreshOpenRouterKey(force = false): Promise<void> {
  if (!force && Date.now() - checkedAt < TTL_MS) return Promise.resolve();
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const snap = await SECRET_DOC().get();
      const key = snap.data()?.key;
      cachedKey = typeof key === "string" && key.trim() ? cleanApiKey(key) : null;
    } catch {
      /* keep the cached key */
    } finally {
      checkedAt = Date.now();
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function saveOpenRouterKey(key: string, by: { uid: string; email: string | null }) {
  const k = cleanApiKey(key);
  await SECRET_DOC().set({ key: k, last4: k.slice(-4), updatedAt: Timestamp.now(), updatedBy: by.email || by.uid });
  cachedKey = k;
  checkedAt = Date.now();
}

export async function clearOpenRouterKey() {
  await SECRET_DOC().delete();
  cachedKey = null;
  checkedAt = Date.now();
}

export async function openRouterKeyInfo(): Promise<OpenRouterKeyInfo> {
  const snap = await SECRET_DOC().get().catch(() => null);
  const d = snap?.data();
  if (d?.key) {
    return { source: "admin", last4: String(d.last4 || String(d.key).slice(-4)), updatedAt: d.updatedAt?.toDate?.().toISOString?.() ?? null, updatedBy: d.updatedBy ?? null };
  }
  const env = process.env.OPENROUTER_API_KEY || "";
  return env ? { source: "environment", last4: env.slice(-4), updatedAt: null, updatedBy: null } : { source: "none", last4: null, updatedAt: null, updatedBy: null };
}

const headers = (key: string) => ({
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  "HTTP-Referer": "https://sunrootlearn.vercel.app",
  "X-Title": "SunRootLearn",
});

/** Asks OpenRouter about the key itself (free, no model call). Returns a plain-words problem, or null when the key works. */
export async function testOpenRouterKey(key: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/key`, { headers: headers(key), signal: AbortSignal.timeout(12_000) });
    if (res.ok) return null;
    if (res.status === 401 || res.status === 403) return "OpenRouter says this key is not valid. Copy it again from openrouter.ai/keys.";
    return `OpenRouter could not check the key (HTTP ${res.status}). Try again in a moment.`;
  } catch {
    return "Could not reach OpenRouter to check the key. Try again in a moment.";
  }
}

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string | Part[];
}

/** Turns what the AI router passes in (a prompt, or Gemini-style contents with text and inline pictures) into chat messages. */
export function toMessages(opts: { systemInstruction?: string; userPrompt?: string; contents?: unknown }): OpenRouterMessage[] {
  const out: OpenRouterMessage[] = [];
  if (opts.systemInstruction) out.push({ role: "system", content: opts.systemInstruction });
  const parts = (raw: unknown): Part[] => {
    const list = Array.isArray(raw) ? raw : [raw];
    const acc: Part[] = [];
    for (const p of list) {
      if (typeof p === "string") acc.push({ type: "text", text: p });
      else if (p && typeof p === "object") {
        const o = p as { text?: unknown; inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } };
        if (typeof o.text === "string" && o.text) acc.push({ type: "text", text: o.text });
        const img = o.inlineData ?? (o.inline_data ? { mimeType: o.inline_data.mime_type, data: o.inline_data.data } : undefined);
        if (img?.data && /^image\//.test(img.mimeType || "")) acc.push({ type: "image_url", image_url: { url: `data:${img.mimeType};base64,${img.data}` } });
      }
    }
    return acc;
  };
  const push = (role: OpenRouterMessage["role"], ps: Part[]) => {
    if (!ps.length) return;
    out.push({ role, content: ps.every((p) => p.type === "text") ? ps.map((p) => (p as { text: string }).text).join("\n") : ps });
  };
  if (Array.isArray(opts.contents)) {
    for (const item of opts.contents) {
      if (typeof item === "string") push("user", parts(item));
      else if (item && typeof item === "object") {
        const it = item as { role?: string; text?: unknown; parts?: unknown };
        const role = it.role === "model" || it.role === "assistant" ? "assistant" : it.role === "system" ? "system" : "user";
        push(role, it.parts !== undefined ? parts(it.parts) : parts(it.text));
      }
    }
  } else if (typeof opts.contents === "string") push("user", parts(opts.contents));
  else if (opts.userPrompt) push("user", parts(opts.userPrompt));
  if (!out.some((m) => m.role !== "system")) out.push({ role: "user", content: "Hello" });
  return out;
}

export interface OpenRouterCall {
  /** one model per call; the caller loops over its chain so it can check each answer */
  model: string;
  systemInstruction?: string;
  userPrompt?: string;
  contents?: unknown;
  /** ask for a JSON object */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}
export interface OpenRouterResult {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

export class OpenRouterError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
  /** this model can't be used right now (wrong name, not allowed, no providers up): move on to the next one */
  get modelProblem(): boolean {
    return this.status === 404 || this.status === 400 || this.status === 403 || this.status === 429 || this.status === 502 || this.status === 503;
  }
}

export async function callOpenRouterChat(opts: OpenRouterCall): Promise<OpenRouterResult> {
  await refreshOpenRouterKey();
  const key = activeOpenRouterKey();
  if (!key) throw new OpenRouterError("OpenRouter is not configured. Add the key in Admin, System, AI Key & Provider.", 401);
  const started = Date.now();
  const payload: Record<string, unknown> = {
    model: opts.model,
    messages: toMessages(opts),
    temperature: typeof opts.temperature === "number" ? opts.temperature : 0.4,
  };
  if (opts.maxTokens) payload.max_tokens = opts.maxTokens;
  if (opts.json) {
    payload.response_format = { type: "json_object" };
    // only route to providers that really support a JSON answer
    payload.provider = { require_parameters: true };
  }
  const res = await fetch(`${BASE}/chat/completions`, { method: "POST", headers: headers(key), body: JSON.stringify(payload), signal: opts.signal ?? AbortSignal.timeout(110_000) });
  const data = (await res.json().catch(() => null)) as { choices?: Array<{ message?: { content?: unknown } }>; model?: string; usage?: { prompt_tokens?: number; completion_tokens?: number }; error?: { message?: string } } | null;
  if (!res.ok || data?.error) throw new OpenRouterError(data?.error?.message || `OpenRouter error (HTTP ${res.status})`, res.status);
  const content = data?.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((c) => (c as { text?: string })?.text || "").join("") : "";
  if (!text.trim()) throw new OpenRouterError("The model returned an empty answer.", 502);
  return { text, model: data?.model || opts.model, tokensIn: data?.usage?.prompt_tokens || 0, tokensOut: data?.usage?.completion_tokens || 0, latencyMs: Date.now() - started };
}

/** Text to speech through OpenRouter. Returns MP3 bytes, or null when the voice could not be made (the caller falls back). */
export async function synthesizeOpenRouterSpeech(text: string, o: { model: string; voice: string; speed?: number }, timeoutMs = 25_000): Promise<Buffer | null> {
  await refreshOpenRouterKey();
  const key = activeOpenRouterKey();
  if (!key || !text.trim()) return null;
  try {
    const res = await fetch(`${BASE}/audio/speech`, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({ model: o.model, input: text.trim().slice(0, 4000), voice: o.voice, response_format: "mp3", speed: o.speed ?? 1 }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (type.includes("json")) return null; // an error body, not audio
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 500 ? buf : null;
  } catch {
    return null;
  }
}
