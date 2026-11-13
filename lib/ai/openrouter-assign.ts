import { adminDb } from "@/lib/firebase/admin";
import { chainWithOverride, orClassFor } from "@/lib/ai/openrouter-models";

/** The admin's own pick of OpenRouter model per task (systemConfig/openrouterModels), on top of the recommended chains. */
let cache: Record<string, string> | null = null;
let cachedAt = 0;

export async function getOpenRouterAssignments(force = false): Promise<Record<string, string>> {
  if (!force && cache && Date.now() - cachedAt < 10_000) return cache;
  try {
    const doc = await adminDb().collection("systemConfig").doc("openrouterModels").get();
    const raw = (doc.exists ? doc.data() : {}) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) if (typeof v === "string" && v.trim() && k !== "updatedBy") out[k] = v.trim();
    cache = out;
  } catch {
    cache = cache || {};
  }
  cachedAt = Date.now();
  return cache;
}

export function setCachedOpenRouterAssignments(c: Record<string, string>) {
  cache = c;
  cachedAt = Date.now();
}

/** The models to try, in order, for a task. */
export async function openRouterChainFor(task: string): Promise<string[]> {
  const a = await getOpenRouterAssignments();
  // the admin can pick for one task, or for a whole kind of work ("class:code")
  return chainWithOverride(task, a[task] || a[`class:${orClassFor(task)}`]);
}
