import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { cleanApiKey } from "@/lib/ai/api-key";

/**
 * Groq AI Engine Integration:
 * Provides ultra-fast inference on Llama 3 models (Llama 3.3 70B & Llama 3.1 8B).
 * An admin can set a Groq API key and toggle the active AI provider between "gemini" and "groq".
 * Stored securely in Firestore `secrets/groq` and `secrets/ai_provider`.
 */

export type AiProvider = "gemini" | "groq";

const GROQ_SECRET_DOC = () => adminDb().collection("secrets").doc("groq");
const PROVIDER_DOC = () => adminDb().collection("secrets").doc("ai_provider");

const TTL_MS = 60_000;

let cachedGroqKey: string | null = null;
let cachedProvider: AiProvider | null = null;
let lastGroqCheckedAt = 0;
let lastProviderCheckedAt = 0;
let groqRefreshing: Promise<void> | null = null;
let providerRefreshing: Promise<void> | null = null;

export interface GroqKeyInfo {
  source: "admin" | "environment" | "none";
  last4: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface ProviderInfo {
  provider: AiProvider;
  geminiConfigured: boolean;
  groqConfigured: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

/** Check if string has a plausible Groq API key format (starts with "gsk_" and 25+ chars). */
export function looksLikeGroqKey(key: string): boolean {
  const k = cleanApiKey(key);
  return k.startsWith("gsk_") && k.length >= 25 && !/\s/.test(k);
}

/** The active Groq API key (synchronous with background refresh). */
export function activeGroqKey(): string {
  if (Date.now() - lastGroqCheckedAt > TTL_MS) void refreshGroqKey();
  return cachedGroqKey || process.env.GROQ_API_KEY || "";
}

/** Re-reads the Groq key from Firestore. */
export function refreshGroqKey(force = false): Promise<void> {
  if (!force && Date.now() - lastGroqCheckedAt < TTL_MS) return Promise.resolve();
  if (groqRefreshing) return groqRefreshing;
  groqRefreshing = (async () => {
    try {
      const snap = await GROQ_SECRET_DOC().get();
      const key = snap.data()?.key;
      cachedGroqKey = typeof key === "string" && key.trim() ? cleanApiKey(key) : null;
    } catch {
      /* keep cached key */
    } finally {
      lastGroqCheckedAt = Date.now();
      groqRefreshing = null;
    }
  })();
  return groqRefreshing;
}

/** Re-reads the active provider from Firestore. */
export function refreshAiProvider(force = false): Promise<void> {
  if (!force && Date.now() - lastProviderCheckedAt < TTL_MS) return Promise.resolve();
  if (providerRefreshing) return providerRefreshing;
  providerRefreshing = (async () => {
    try {
      const snap = await PROVIDER_DOC().get();
      const p = snap.data()?.provider;
      cachedProvider = p === "groq" ? "groq" : "gemini";
    } catch {
      /* default to gemini */
    } finally {
      lastProviderCheckedAt = Date.now();
      providerRefreshing = null;
    }
  })();
  return providerRefreshing;
}

/** Returns the active AI provider: "gemini" or "groq". */
export async function getActiveAiProvider(): Promise<AiProvider> {
  await refreshAiProvider();
  return cachedProvider || "gemini";
}

/** Sets the active AI provider ("gemini" or "groq"). */
export async function setAiProvider(provider: AiProvider, by: { uid: string; email: string | null }) {
  await PROVIDER_DOC().set({
    provider,
    updatedAt: Timestamp.now(),
    updatedBy: by.email || by.uid,
  });
  cachedProvider = provider;
  lastProviderCheckedAt = Date.now();
}

/** Saves a new Groq API key. */
export async function saveGroqKey(key: string, by: { uid: string; email: string | null }) {
  const k = cleanApiKey(key);
  await GROQ_SECRET_DOC().set({
    key: k,
    last4: k.slice(-4),
    updatedAt: Timestamp.now(),
    updatedBy: by.email || by.uid,
  });
  cachedGroqKey = k;
  lastGroqCheckedAt = Date.now();
}

/** Clears the admin-configured Groq key. */
export async function clearGroqKey() {
  await GROQ_SECRET_DOC().delete();
  cachedGroqKey = null;
  lastGroqCheckedAt = Date.now();
}

/** Returns metadata about the current Groq key (never exposes full key). */
export async function groqKeyInfo(): Promise<GroqKeyInfo> {
  const snap = await GROQ_SECRET_DOC().get().catch(() => null);
  const d = snap?.data();
  if (d?.key) {
    return {
      source: "admin",
      last4: String(d.last4 || String(d.key).slice(-4)),
      updatedAt: d.updatedAt?.toDate?.().toISOString?.() ?? null,
      updatedBy: d.updatedBy ?? null,
    };
  }
  const env = process.env.GROQ_API_KEY || "";
  return env
    ? { source: "environment", last4: env.slice(-4), updatedAt: null, updatedBy: null }
    : { source: "none", last4: null, updatedAt: null, updatedBy: null };
}

/** Returns metadata about the current active provider setting. */
export async function aiProviderInfo(): Promise<ProviderInfo> {
  await Promise.all([refreshAiProvider(), refreshGroqKey()]);
  const snap = await PROVIDER_DOC().get().catch(() => null);
  const d = snap?.data();
  const provider: AiProvider = d?.provider === "groq" ? "groq" : "gemini";
  const { activeGeminiKey } = await import("@/lib/ai/api-key");
  const geminiKey = activeGeminiKey();
  const groqKey = activeGroqKey();

  return {
    provider,
    geminiConfigured: Boolean(geminiKey),
    groqConfigured: Boolean(groqKey),
    updatedAt: d?.updatedAt?.toDate?.().toISOString?.() ?? null,
    updatedBy: d?.updatedBy ?? null,
  };
}

/** Tests a Groq API key with a tiny lightweight request. Returns null on success or error string. */
export async function testGroqKey(key: string): Promise<string | null> {
  const clean = cleanApiKey(key);
  if (!clean) return "Please provide a Groq API key.";

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clean}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: "Reply with the single word: ok" }],
        max_tokens: 5,
        temperature: 0,
      }),
    });

    if (res.ok) {
      return null; // Key works!
    }

    const data = await res.json().catch(() => ({}));
    const msg = data.error?.message || `HTTP ${res.status}`;

    if (res.status === 401 || /invalid_api_key|unauthorized/i.test(msg)) {
      return "Groq rejected this API key. Please check you copied the complete key from console.groq.com/keys.";
    }
    if (res.status === 429 || /rate_limit/i.test(msg)) {
      return "This Groq key works, but its rate limit is currently reached. Please try again shortly.";
    }

    return `Groq error: ${msg}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Could not reach Groq API: ${msg}`;
  }
}

export interface GroqCallOptions {
  model?: string;
  systemInstruction?: string;
  userPrompt?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contents?: any;
  schema?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface GroqCallResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  model: string;
}

/** Maps a task or requested model to the best corresponding Groq model. */
export function mapToGroqModel(requestedModel?: string, isHeavy = false): string {
  if (requestedModel && /llama|mixtral|gemma/i.test(requestedModel)) {
    return requestedModel;
  }
  // Llama 3.3 70B is Groq's flagship model: exceptional for reasoning, structured JSON, code, and class builds
  return isHeavy ? "llama-3.3-70b-versatile" : "llama-3.1-8b-instant";
}

/** Executes a chat completion against Groq's high-speed API. */
export async function callGroqChat(opts: GroqCallOptions): Promise<GroqCallResult> {
  const apiKey = activeGroqKey();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured. Add a Groq key in Admin Console → AI Key & Provider.");
  }

  const model = opts.model || "llama-3.3-70b-versatile";
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

  if (opts.systemInstruction) {
    messages.push({ role: "system", content: opts.systemInstruction });
  }

  // Parse contents / userPrompt
  if (Array.isArray(opts.contents)) {
    for (const item of opts.contents) {
      if (typeof item === "string") {
        messages.push({ role: "user", content: item });
      } else if (item && typeof item === "object") {
        const role = item.role === "model" ? "assistant" : item.role === "system" ? "system" : "user";
        const text =
          typeof item.text === "string"
            ? item.text
            : Array.isArray(item.parts)
            ? item.parts.map((p: unknown) => (typeof p === "string" ? p : (p as { text?: string })?.text || "")).join("\n")
            : "";
        if (text) messages.push({ role, content: text });
      }
    }
  } else if (typeof opts.contents === "string") {
    messages.push({ role: "user", content: opts.contents });
  } else if (opts.userPrompt) {
    messages.push({ role: "user", content: opts.userPrompt });
  }

  if (messages.length === 0) {
    messages.push({ role: "user", content: "Hello" });
  }

  // Ensure JSON instruction is present in system message if schema is expected
  if (opts.schema) {
    const hasJsonInstruction = messages.some((m) => m.content.toLowerCase().includes("json"));
    if (!hasJsonInstruction) {
      messages.unshift({ role: "system", content: "You must reply with valid JSON only." });
    }
  }

  const startTime = Date.now();

  const payload: Record<string, unknown> = {
    model,
    messages,
    temperature: typeof opts.temperature === "number" ? opts.temperature : 0.4,
  };

  if (opts.schema) {
    payload.response_format = { type: "json_object" };
  }
  if (opts.maxTokens) {
    payload.max_tokens = opts.maxTokens;
  }

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const latencyMs = Date.now() - startTime;

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const errMsg = errData.error?.message || `HTTP ${res.status}`;
    throw new Error(`[Groq Error] ${errMsg}`);
  }

  const json = await res.json();
  const choice = json.choices?.[0];
  const text = choice?.message?.content || "";
  const usage = json.usage;

  return {
    text,
    tokensIn: usage?.prompt_tokens || 300,
    tokensOut: usage?.completion_tokens || 400,
    latencyMs,
    model,
  };
}
