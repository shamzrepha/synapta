import { ApiError } from "@/lib/api/errors";
import { getSiteConfig } from "@/lib/config/site";
import { overDailyCap } from "@/lib/ai/openrouter-spend";

/**
 * Cost gates for AI paths that do not go through generateWithFallback (voice, speech-to-text, Worlds structured output).
 * Call before spending anything on behalf of a learner. Admin health probes must not call these.
 */

/** The admin kill switch (/admin/controls). With `spend: true` the OpenRouter daily cap is checked too. */
export async function assertAiActive(opts: { spend?: boolean } = {}): Promise<void> {
  const site = await getSiteConfig();
  if (site.aiPaused) throw new ApiError(503, "AI_PAUSED", site.aiPausedMessage);
  if (opts.spend) await assertUnderSpendCap();
}

/** Refuses once today's OpenRouter spend has reached the admin's daily cap. */
export async function assertUnderSpendCap(): Promise<void> {
  const budget = await overDailyCap();
  if (budget.over) throw new ApiError(503, "AI_SPEND_CAP", "AI is resting for today to keep costs under control. Please try again tomorrow.");
}
