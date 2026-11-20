import { generateWithFallback } from "@/lib/ai/router";
import { checkRateLimitAndQuota } from "@/lib/quota/guard";
import type { MirrorProfile, MirrorState } from "./schema";
import { saveSummary } from "./store";
import { fallbackSummary, summaryIsFresh, summaryIsSafe, summaryPrompt, summarySchema, summaryWanted, SUMMARY_SYSTEM } from "./summary";

/**
 * The only AI call in the Mirror: one short, cached summary per opted-in learner per week, quota-checked.
 * The slot is claimed (with the plain fallback text) BEFORE the call, so two tabs cannot both spend it.
 * Any failure keeps the fallback text. Returns the text to show.
 */
export async function summaryFor(uid: string, state: MirrorState, profile: MirrorProfile, nowMs = Date.now()): Promise<string> {
  if (!state.personalise) return "";
  if (summaryIsFresh(state, nowMs)) return state.summary!.text;
  const fallback = fallbackSummary(profile);
  if (!summaryWanted(state, profile, nowMs)) return fallback;
  await saveSummary(uid, fallback, nowMs);
  try {
    await checkRateLimitAndQuota(uid, 600);
    const r = await generateWithFallback({
      task: "mirror_summary",
      systemInstruction: SUMMARY_SYSTEM,
      userPrompt: summaryPrompt(profile),
      schema: summarySchema,
      temperature: 0.4,
      userId: uid,
      personalize: false,
    });
    const text = r.data?.text?.trim();
    if (text && summaryIsSafe(text)) {
      await saveSummary(uid, text, nowMs);
      return text;
    }
  } catch (err) {
    console.warn("[mirror] summary AI unavailable, using the plain text:", err instanceof Error ? err.message : err);
  }
  return fallback;
}
