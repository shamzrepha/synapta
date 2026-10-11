import { adminDb } from "@/lib/firebase/admin";
import { getPacificDateString, getRpdLimit, KNOWN_MODELS } from "./models";

export interface ModelHealthEntry {
  status: "ok" | "exhausted" | "invalid";
  exhaustedUntil?: string; // ISO
  exhaustedUntilMs?: number;
  reason?: string;
  lastChecked: string;
}

// In-memory cache for 60 seconds
const memoryHealthCache = new Map<string, { entry: ModelHealthEntry; cachedAt: number }>();
const CACHE_TTL_MS = 60 * 1000;

/**
 * Calculates the next Pacific Midnight reset timestamp with a 5-minute safety margin.
 * Daily quotas reset at midnight America/Los_Angeles.
 */
export function calculatePacificMidnightReset(): { iso: string; timestampMs: number; display: string } {
  const now = new Date();
  const pacificFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });

  const parts = pacificFormatter.formatToParts(now);
  const findPart = (t: string) => parseInt(parts.find((p) => p.type === t)?.value || "0", 10);
  const hour = findPart("hour");
  const minute = findPart("minute");
  const second = findPart("second");

  // Calculate seconds remaining until 24:00 Pacific
  const secondsSinceMidnight = hour * 3600 + minute * 60 + second;
  const secondsUntilMidnight = 86400 - secondsSinceMidnight;

  // Add 5-minute safety margin (300 seconds)
  const resetMs = now.getTime() + (secondsUntilMidnight + 300) * 1000;
  const resetDate = new Date(resetMs);

  const display = resetDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  return {
    iso: resetDate.toISOString(),
    timestampMs: resetMs,
    display,
  };
}

/**
 * Checks if a model is currently exhausted or marked invalid.
 */
export async function isModelAvailable(model: string): Promise<boolean> {
  const now = Date.now();
  const mem = memoryHealthCache.get(model);
  if (mem && now - mem.cachedAt < CACHE_TTL_MS) {
    if (mem.entry.status === "invalid") return false;
    if (mem.entry.status === "exhausted" && mem.entry.exhaustedUntilMs && now < mem.entry.exhaustedUntilMs) {
      return false;
    }
  }

  try {
    const docRef = adminDb().collection("aiHealth").doc("models");
    const snap = await docRef.get();
    if (snap.exists) {
      const data = snap.data() || {};
      const entry = data[model] as ModelHealthEntry | undefined;
      if (entry) {
        memoryHealthCache.set(model, { entry, cachedAt: now });
        if (entry.status === "invalid") return false;
        if (entry.status === "exhausted" && entry.exhaustedUntilMs && now < entry.exhaustedUntilMs) {
          return false;
        }
      }
    }
  } catch (err) {
    // If Firestore fails, fall back to in-memory state
    console.warn(`[lib/ai/health] Failed to read aiHealth from Firestore:`, err);
  }

  return true;
}

/**
 * Marks a model as exhausted until Pacific midnight or until specific timestamp.
 */
export async function markModelExhausted(model: string, delaySeconds?: number): Promise<void> {
  const reset = delaySeconds && delaySeconds > 0
    ? {
        iso: new Date(Date.now() + (delaySeconds + 60) * 1000).toISOString(),
        timestampMs: Date.now() + (delaySeconds + 60) * 1000,
        display: new Date(Date.now() + (delaySeconds + 60) * 1000).toLocaleTimeString(),
      }
    : calculatePacificMidnightReset();

  const entry: ModelHealthEntry = {
    status: "exhausted",
    exhaustedUntil: reset.iso,
    exhaustedUntilMs: reset.timestampMs,
    reason: delaySeconds ? `Rate limit delay (${delaySeconds}s)` : "Daily quota exceeded",
    lastChecked: new Date().toISOString(),
  };

  memoryHealthCache.set(model, { entry, cachedAt: Date.now() });

  try {
    const docRef = adminDb().collection("aiHealth").doc("models");
    await docRef.set({ [model]: entry }, { merge: true });
  } catch (err) {
    console.warn(`[lib/ai/health] Failed to persist exhausted state for ${model}:`, err);
  }
}

/**
 * Marks a model invalid (404/deprecated) for 1 hour.
 */
export async function markModelInvalid(model: string): Promise<void> {
  const entry: ModelHealthEntry = {
    status: "invalid",
    exhaustedUntil: new Date(Date.now() + 3600 * 1000).toISOString(),
    exhaustedUntilMs: Date.now() + 3600 * 1000,
    reason: "Model returned 404 or deprecated",
    lastChecked: new Date().toISOString(),
  };

  memoryHealthCache.set(model, { entry, cachedAt: Date.now() });

  try {
    const docRef = adminDb().collection("aiHealth").doc("models");
    await docRef.set({ [model]: entry }, { merge: true });
  } catch (err) {
    console.warn(`[lib/ai/health] Failed to persist invalid state for ${model}:`, err);
  }
}

/**
 * Clears exhausted/invalid status for a specific model (e.g. after successful test call or manual unstick).
 */
export async function clearModelExhausted(model: string): Promise<void> {
  memoryHealthCache.delete(model);
  try {
    const docRef = adminDb().collection("aiHealth").doc("models");
    await docRef.set(
      {
        [model]: {
          status: "ok",
          lastChecked: new Date().toISOString(),
        },
      },
      { merge: true }
    );
  } catch (err) {
    console.warn(`[lib/ai/health] Failed to clear exhausted state for ${model}:`, err);
  }
}

/**
 * Clears all model exhaustion entries in Firestore and in-memory cache.
 */
export async function clearAllModelExhaustion(): Promise<void> {
  memoryHealthCache.clear();
  try {
    const docRef = adminDb().collection("aiHealth").doc("models");
    await docRef.delete();
  } catch (err) {
    console.warn(`[lib/ai/health] Failed to clear all exhausted models:`, err);
  }
}


/**
 * Increments request count and token usage for the model's Pacific date budget.
 */
export async function recordModelUsage(model: string, tokensIn: number, tokensOut: number): Promise<void> {
  const pacificDate = getPacificDateString();
  const docId = `${model}_${pacificDate}`;

  try {
    const docRef = adminDb().collection("aiUsage").doc(docId);
    await adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) {
        tx.set(docRef, {
          model,
          date: pacificDate,
          requests: 1,
          tokensIn,
          tokensOut,
          totalTokens: tokensIn + tokensOut,
          updatedAt: new Date().toISOString(),
        });
      } else {
        const d = snap.data() || {};
        tx.update(docRef, {
          requests: (d.requests || 0) + 1,
          tokensIn: (d.tokensIn || 0) + tokensIn,
          tokensOut: (d.tokensOut || 0) + tokensOut,
          totalTokens: (d.totalTokens || 0) + tokensIn + tokensOut,
          updatedAt: new Date().toISOString(),
        });
      }
    });
  } catch (err) {
    console.warn(`[lib/ai/health] Failed to record usage in aiUsage for ${docId}:`, err);
  }
}

/**
 * Returns model usage for today in Pacific time.
 */
export async function getModelUsageToday(model: string): Promise<{ requests: number; totalTokens: number }> {
  const pacificDate = getPacificDateString();
  const docId = `${model}_${pacificDate}`;

  try {
    const docRef = adminDb().collection("aiUsage").doc(docId);
    const snap = await docRef.get();
    if (snap.exists) {
      const d = snap.data() || {};
      return {
        requests: typeof d.requests === "number" ? d.requests : 0,
        totalTokens: typeof d.totalTokens === "number" ? d.totalTokens : 0,
      };
    }
  } catch {}

  return { requests: 0, totalTokens: 0 };
}

/**
 * Checks if model is within reserve limits.
 * Per Fix Pack D, Synapta never imposes its own artificial daily quota or 90% reserve.
 * Only real provider 429 errors from Google may divert or pause a call.
 */
export async function isWithinModelReserve(_model: string, _isPrivileged = false): Promise<boolean> {
  return true;
}

/**
 * Compiles a comprehensive health report for Admin System tab.
 */
export async function getModelsHealthReport(): Promise<Array<{
  model: string;
  tier: string;
  rpd: number;
  requestsToday: number;
  tokensToday: number;
  status: "ok" | "exhausted" | "invalid";
  exhaustedUntil?: string;
}>> {
  const results = [];
  const modelKeys = Object.keys(KNOWN_MODELS);

  for (const m of modelKeys) {
    const meta = KNOWN_MODELS[m];
    const usage = await getModelUsageToday(m);
    const mem = memoryHealthCache.get(m);
    const isAvail = await isModelAvailable(m);
    const status = (!isAvail ? (mem?.entry.status || "exhausted") : "ok") as "ok" | "exhausted" | "invalid";

    results.push({
      model: m,
      tier: meta.tier,
      rpd: getRpdLimit(m),
      requestsToday: usage.requests,
      tokensToday: usage.totalTokens,
      status,
      exhaustedUntil: status !== "ok" ? mem?.entry.exhaustedUntil : undefined,
    });
  }

  return results;
}
