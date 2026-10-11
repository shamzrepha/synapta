export type Activity = "quiz" | "flashcard" | "lab" | "peer_explain";

export const OMEGA: Record<Activity, number> = {
  quiz: 1.0,
  flashcard: 1.25,
  lab: 1.75,
  peer_explain: 2.0,
};

export interface BktParameters {
  pL0?: number;
  pT: number;
  pG: number;
  pS: number;
}

export const DEFAULT_BKT_PARAMS: Required<BktParameters> = {
  pL0: 0.20,
  pT: 0.15,
  pG: 0.20,
  pS: 0.10,
};

export const MASTERY_THRESHOLD = 0.95;
export const STRUGGLING_THRESHOLD = 0.40;
export const STRONG_THRESHOLD = 0.85;
export const PREREQUISITE_UNLOCK_THRESHOLD = 0.70;

export function validateBktParameters(p: BktParameters): void {
  const { pT, pG, pS } = p;
  if (pT <= 0 || pT >= 1) {
    throw new Error(`pT must be strictly between 0 and 1 (received ${pT})`);
  }
  if (pG <= 0 || pG >= 1) {
    throw new Error(`pG must be strictly between 0 and 1 (received ${pG})`);
  }
  if (pS <= 0 || pS >= 1) {
    throw new Error(`pS must be strictly between 0 and 1 (received ${pS})`);
  }
  if (pG + pS >= 1) {
    throw new Error(
      `Model identifiability violation: pG + pS must be strictly less than 1 (received ${pG + pS})`
    );
  }
  if (p.pL0 !== undefined && (p.pL0 <= 0 || p.pL0 >= 1)) {
    throw new Error(`pL0 must be strictly between 0 and 1 (received ${p.pL0})`);
  }
}

/**
 * Returns sanitized, valid BKT parameters with default fallbacks if missing or degenerate.
 * Enforces 0 < p < 1 and the model identifiability invariant: pG + pS < 1.
 */
export function safeBktParams(raw?: Partial<BktParameters> | null): Required<BktParameters> {
  const pL0 = typeof raw?.pL0 === "number" && raw.pL0 > 0 && raw.pL0 < 1 ? raw.pL0 : DEFAULT_BKT_PARAMS.pL0;
  const pT = typeof raw?.pT === "number" && raw.pT > 0 && raw.pT < 1 ? raw.pT : DEFAULT_BKT_PARAMS.pT;
  let pG = typeof raw?.pG === "number" && raw.pG > 0 && raw.pG < 1 ? raw.pG : DEFAULT_BKT_PARAMS.pG;
  let pS = typeof raw?.pS === "number" && raw.pS > 0 && raw.pS < 1 ? raw.pS : DEFAULT_BKT_PARAMS.pS;

  if (pG + pS >= 1) {
    pG = DEFAULT_BKT_PARAMS.pG;
    pS = DEFAULT_BKT_PARAMS.pS;
  }

  return { pL0, pT, pG, pS };
}

/**
 * Standard Bayesian Knowledge Tracing Bayesian update step with activity-specific learning rate scaling.
 *
 * @param pLPrev Prior probability of mastery P(L_{t-1}) in [0, 1]
 * @param correct Observed performance evidence (true if correct/successful, false otherwise)
 * @param p BKT model parameters (pT, pG, pS)
 * @param activity Activity category influencing learning transition rate omega
 * @returns Posterior probability of mastery P(L_t) clamped to [0.0001, 0.9999]
 */
export function updateMastery(
  pLPrev: number,
  correct: boolean,
  p: BktParameters,
  activity: Activity
): number {
  validateBktParameters(p);

  // Numerical safeguard on input prior
  const clampedPrev = Math.min(0.9999, Math.max(0.0001, pLPrev));

  // 1. Evidence Step (Bayes posterior given observation)
  const num = correct ? clampedPrev * (1 - p.pS) : clampedPrev * p.pS;
  const den = correct
    ? clampedPrev * (1 - p.pS) + (1 - clampedPrev) * p.pG
    : clampedPrev * p.pS + (1 - clampedPrev) * (1 - p.pG);

  const posterior = den === 0 ? clampedPrev : num / den;

  // 2. Learning Step with activity weighting
  const omega = OMEGA[activity] ?? 1.0;
  const pTStar = Math.min(1.0, p.pT * omega);
  const next = posterior + (1 - posterior) * pTStar;

  // 3. Clamp for numerical safety
  return Math.min(0.9999, Math.max(0.0001, next));
}

export function isMastered(pL: number): boolean {
  return pL >= MASTERY_THRESHOLD;
}

export function isStruggling(pL: number): boolean {
  return pL < STRUGGLING_THRESHOLD;
}

export function isStrong(pL: number): boolean {
  return pL > STRONG_THRESHOLD;
}
