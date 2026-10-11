/**
 * Measured Representation Adaptation Engine (Multi-Armed Bandit).
 *
 * Grounded in Educational Psychology research:
 * - We do NOT label learners with fixed "learning styles".
 * - We measure empirical learning gain (avgPLGain) per explanation format
 *   for that specific student and concept.
 * - Epsilon-greedy multi-armed bandit (epsilon = 0.20) balances exploitation
 *   of highest-gain representations with exploration.
 */

import { Representation, REPRESENTATIONS } from "./representations";

export interface RepresentationStat {
  tries: number;
  avgPLGain: number;
}

export type RepresentationStatsMap = Record<string, RepresentationStat>;

export interface ChooseRepresentationParams {
  stats?: RepresentationStatsMap;
  lastUsed?: Representation | null;
  explicitPrefs?: Representation[];
  randomValue?: number; // for deterministic unit testing
}

/**
 * Pure selection function using Epsilon-Greedy multi-armed bandit.
 */
export function chooseRepresentation({
  stats = {},
  lastUsed,
  explicitPrefs = [],
  randomValue = Math.random(),
}: ChooseRepresentationParams): Representation {
  // 1. Explicit learner preference always takes precedence if configured
  if (explicitPrefs.length > 0) {
    const validExplicit = explicitPrefs.filter((p) => p !== lastUsed);
    if (validExplicit.length > 0) {
      return validExplicit[0];
    }
  }

  // Candidates: all representations excluding the one that just failed
  const candidates = REPRESENTATIONS.filter((r) => r !== lastUsed);

  // If some candidates have never been tried (< 2 tries), explore those first
  const underExplored = candidates.filter((r) => (stats[r]?.tries ?? 0) < 2);
  if (underExplored.length > 0) {
    const idx = Math.floor(randomValue * underExplored.length);
    return underExplored[idx];
  }

  // Epsilon-greedy choice:
  // With probability epsilon (0.20), explore uniformly
  const EPSILON = 0.20;
  if (randomValue < EPSILON) {
    const exploreCandidates = candidates;
    const idx = Math.floor((randomValue / EPSILON) * exploreCandidates.length);
    return exploreCandidates[Math.min(exploreCandidates.length - 1, idx)];
  }

  // Exploit: pick candidate with highest measured avgPLGain
  let best = candidates[0];
  let maxGain = -Infinity;

  for (const c of candidates) {
    const gain = stats[c]?.avgPLGain ?? 0;
    if (gain > maxGain) {
      maxGain = gain;
      best = c;
    }
  }

  return best;
}

/**
 * Pure update step for running average learning gain.
 */
export function updateRepresentationStats(
  currentStats: RepresentationStatsMap,
  representation: Representation,
  pLGain: number
): RepresentationStatsMap {
  const current = currentStats[representation] || { tries: 0, avgPLGain: 0 };
  const nextTries = current.tries + 1;
  const nextAvgGain = (current.avgPLGain * current.tries + pLGain) / nextTries;

  return {
    ...currentStats,
    [representation]: {
      tries: nextTries,
      avgPLGain: Number(nextAvgGain.toFixed(4)),
    },
  };
}
