import { adminDb } from "@/lib/firebase/admin";
import { isHeavyTask } from "@/lib/ai/models";
import { mapToGroqModel } from "@/lib/ai/groq";

/** Per-task Groq model choices the admin makes (systemConfig/groqModels), mirroring the Gemini assignments. */
let cache: Record<string, string> | null = null;
let cachedAt = 0;

export async function getGroqAssignments(force = false): Promise<Record<string, string>> {
  if (!force && cache && Date.now() - cachedAt < 10_000) return cache;
  try {
    const doc = await adminDb().collection("systemConfig").doc("groqModels").get();
    const raw = (doc.exists ? doc.data() : {}) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) if (typeof v === "string" && v.trim() && k !== "updatedBy") out[k] = v;
    cache = out;
  } catch {
    cache = cache || {};
  }
  cachedAt = Date.now();
  return cache;
}

export function setCachedGroqAssignments(c: Record<string, string>) {
  cache = c;
  cachedAt = Date.now();
}

/** The Groq model for a task: the admin's pick if there is one, otherwise the built-in default for light/heavy work. */
export async function groqModelFor(task: string): Promise<string> {
  const a = await getGroqAssignments();
  return a[task] || mapToGroqModel(undefined, isHeavyTask(task));
}
