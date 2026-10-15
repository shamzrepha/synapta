/** Weekly leagues: ~30 learners per cohort, ranked by XP earned Monday–Sunday (UTC). */
export const LEAGUE_TIERS = [
  { name: "Bronze", color: "#b45309", emoji: "🥉" },
  { name: "Silver", color: "#64748b", emoji: "🥈" },
  { name: "Gold", color: "#ca8a04", emoji: "🥇" },
  { name: "Platinum", color: "#0891b2", emoji: "💠" },
  { name: "Emerald", color: "#059669", emoji: "💚" },
  { name: "Sapphire", color: "#2563eb", emoji: "🔷" },
  { name: "Ruby", color: "#e11d48", emoji: "❤️‍🔥" },
  { name: "Amethyst", color: "#9333ea", emoji: "🔮" },
  { name: "Obsidian", color: "#1f2937", emoji: "🖤" },
  { name: "Diamond", color: "#06b6d4", emoji: "💎" },
] as const;

export const MAX_TIER = LEAGUE_TIERS.length - 1;
export const COHORT_SIZE = 30;
export const PROMOTE_COUNT = 7;
export const DEMOTE_COUNT = 5;
/** Cohorts smaller than this don't demote anyone (too few people to be fair). */
export const MIN_SIZE_FOR_DEMOTION = 15;

export function tierInfo(tier: number) {
  return LEAGUE_TIERS[Math.min(MAX_TIER, Math.max(0, Math.floor(tier || 0)))];
}

/** ISO week id in UTC, e.g. "2026-W42". Weeks start Monday 00:00 UTC. */
export function weekIdFor(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** When the current league week ends (next Monday 00:00 UTC). */
export function weekEndsAt(date: Date = new Date()): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + (8 - day));
  return d;
}

export type LeagueOutcome = "promoted" | "demoted" | "stayed";

/** Pure promotion/demotion rule so it can be unit tested. */
export function leagueOutcome(params: { rank: number; cohortSize: number; tier: number; xp: number }): LeagueOutcome {
  const { rank, cohortSize, tier, xp } = params;
  if (xp > 0 && tier < MAX_TIER && rank <= Math.min(PROMOTE_COUNT, Math.max(1, Math.ceil(cohortSize / 3)))) {
    return "promoted";
  }
  if (tier > 0 && cohortSize >= MIN_SIZE_FOR_DEMOTION && rank > cohortSize - DEMOTE_COUNT) {
    return "demoted";
  }
  return "stayed";
}
