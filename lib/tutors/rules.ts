/** Pure rules for peer tutoring: ratings, XP and leaderboard scoring. */

export const TUTOR_LIMITS = { question: 1200, answer: 3000, review: 300, bio: 400, availability: 200 };

export function validRating(n: unknown): n is 1 | 2 | 3 | 4 | 5 {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5;
}

/** XP a tutor earns for one rated answer. Low ratings earn little so good help is what pays. */
export function xpForRating(rating: number): number {
  return ({ 1: 2, 2: 4, 3: 10, 4: 15, 5: 20 } as Record<number, number>)[rating] ?? 0;
}

export const XP_CAPS = { perTutorPerDay: 5, perPairPerWeek: 2 };

/**
 * Whether a rating should pay XP. `ratedToday` = rated answers this tutor already got paid for today;
 * `pairThisWeek` = paid ratings between this exact requester and tutor in the last 7 days.
 */
export function xpEligible(ratedToday: number, pairThisWeek: number): boolean {
  return ratedToday < XP_CAPS.perTutorPerDay && pairThisWeek < XP_CAPS.perPairPerWeek;
}

/** Bayesian average so one 5-star rating doesn't outrank 40 ratings averaging 4.8. */
export function tutorScore(ratingSum: number, ratingCount: number, prior = 3.5, priorWeight = 3): number {
  return (ratingSum + prior * priorWeight) / (ratingCount + priorWeight);
}

export function averageRating(ratingSum: number, ratingCount: number): number | null {
  return ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null;
}

export function canRequestTutor(requesterUid: string, tutorUid: string | null | undefined): boolean {
  return !tutorUid || requesterUid !== tutorUid;
}

export function subjectsOverlap(a: string[], b: string): boolean {
  const s = b.trim().toLowerCase();
  return a.some((x) => x === s || x.includes(s) || s.includes(x));
}
