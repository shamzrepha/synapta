/**
 * Ambassador pay. A student who joins through someone's link and pays earns that someone a cut of what they pay:
 *  - the first payment pays by the ambassador's tier (the more paying students they bring, the higher the cut)
 *  - renewals in the first six months pay a smaller flat cut, so one good ambassador keeps earning
 *  - money is only payable after a 7-day hold (so a refunded or charged-back payment never gets paid out)
 * Pure functions, so the numbers on the public page and in the payout are always the same ones.
 */
export const TIERS = [
  { name: "Starter", from: 0, rate: 0.2 },
  { name: "Silver", from: 10, rate: 0.25 },
  { name: "Gold", from: 30, rate: 0.3 },
] as const;
export const RENEWAL_RATE = 0.1;
export const RENEWAL_PAYMENTS_PAID = 6;
export const HOLD_DAYS = 7;
export const MIN_PAYOUT_NGN = 2_000;

export function tierFor(payingReferrals: number) {
  let t: (typeof TIERS)[number] = TIERS[0];
  for (const x of TIERS) if (payingReferrals >= x.from) t = x;
  return t;
}

/** Naira owed for one payment. `nth` is which payment this is for the paying student (1 = the first). */
export function commissionFor(amountNgn: number, nth: number, referrerPayingReferrals: number): number {
  if (!(amountNgn > 0) || nth < 1) return 0;
  if (nth === 1) return Math.floor(amountNgn * tierFor(referrerPayingReferrals).rate);
  if (nth <= 1 + RENEWAL_PAYMENTS_PAID) return Math.floor(amountNgn * RENEWAL_RATE);
  return 0;
}
