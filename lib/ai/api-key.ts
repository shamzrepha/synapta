import { GoogleGenAI } from "@google/genai";
import { adminDb, Timestamp } from "@/lib/firebase/admin";

/**
 * The Gemini API key in use. An admin can set a new key from the Admin Console (stored server-side in the
 * `secrets` collection, which no browser can read under the default-deny Firestore rules); without one, the
 * GEMINI_API_KEY environment variable is used. Every server instance picks a change up within a minute, and the
 * instance that saved it immediately.
 */

const DOC = () => adminDb().collection("secrets").doc("gemini");
const TTL_MS = 60_000;

let override: string | null = null;
let checkedAt = 0;
let refreshing: Promise<void> | null = null;

export interface ApiKeyInfo {
  source: "admin" | "environment" | "none";
  last4: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

/** The key to call Gemini with right now (synchronous; refreshed in the background). */
export function activeGeminiKey(): string {
  if (Date.now() - checkedAt > TTL_MS) void refreshGeminiKey();
  return override || process.env.GEMINI_API_KEY || "";
}

/** Re-reads the admin key (at most once a minute unless forced). Never throws: on failure the last key stays. */
export function refreshGeminiKey(force = false): Promise<void> {
  if (!force && Date.now() - checkedAt < TTL_MS) return Promise.resolve();
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const key = (await DOC().get()).data()?.key;
      override = typeof key === "string" && key.trim() ? key.trim() : null;
    } catch {
      /* keep the current key */
    } finally {
      checkedAt = Date.now();
      refreshing = null;
    }
  })();
  return refreshing;
}

/** A plausible Google AI Studio / Gemini key (format check only; the live test happens before saving). */
export function looksLikeGeminiKey(key: string): boolean {
  return /^AIza[0-9A-Za-z_-]{35}$/.test(key.trim());
}

export async function saveGeminiKey(key: string, by: { uid: string; email: string | null }) {
  const k = key.trim();
  await DOC().set({ key: k, last4: k.slice(-4), updatedAt: Timestamp.now(), updatedBy: by.email || by.uid });
  override = k;
  checkedAt = Date.now();
}

export async function clearGeminiKey() {
  await DOC().delete();
  override = null;
  checkedAt = Date.now();
}

/** What the admin sees: where the key comes from and its last four characters, never the key itself. */
export async function geminiKeyInfo(): Promise<ApiKeyInfo> {
  const snap = await DOC().get().catch(() => null);
  const d = snap?.data();
  if (d?.key) {
    return { source: "admin", last4: String(d.last4 || String(d.key).slice(-4)), updatedAt: d.updatedAt?.toDate?.().toISOString?.() ?? null, updatedBy: d.updatedBy ?? null };
  }
  const env = process.env.GEMINI_API_KEY || "";
  return env ? { source: "environment", last4: env.slice(-4), updatedAt: null, updatedBy: null } : { source: "none", last4: null, updatedAt: null, updatedBy: null };
}

/** Proves a key works with one tiny real request. Returns null when it works, else a plain reason for the admin. */
export async function testGeminiKey(key: string, model: string): Promise<string | null> {
  try {
    const probe = await new GoogleGenAI({ apiKey: key }).models.generateContent({ model, contents: "Reply with the single word: ok" });
    return probe.text ? null : "Gemini answered with nothing. Try again in a moment.";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/API key not valid|API_KEY_INVALID|PERMISSION_DENIED|401|403/i.test(msg)) {
      return "Google rejected this key. Check you copied all of it and that the Generative Language API is enabled for its project.";
    }
    if (/RESOURCE_EXHAUSTED|429|quota/i.test(msg)) {
      return "This key works but its quota is already used up. Turn on billing for its project or wait for the daily reset.";
    }
    return "Couldn't reach Gemini with this key right now. Try again in a moment.";
  }
}
