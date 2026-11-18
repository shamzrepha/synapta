import { adminDb, FieldValue } from "@/lib/firebase/admin";

/**
 * What OpenRouter is costing, counted per day (collection aiSpend, one document per UTC day) with a daily limit the admin can change.
 * Every call is counted, including the ones that failed or came back empty: those are charged too.
 */
export const DEFAULT_DAILY_CAP_USD = 1.5;

const day = (d = new Date()) => d.toISOString().slice(0, 10);
const safeKey = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);

/** Used only when OpenRouter does not send the real cost: deliberately on the high side so the limit trips early rather than late. */
export function estimateCostUsd(tokensIn: number, tokensOut: number): number {
  return (tokensIn * 3 + tokensOut * 15) / 1_000_000;
}

export interface SpendEvent {
  task: string;
  model: string;
  costUsd?: number | null;
  tokensIn: number;
  tokensOut: number;
}

let todayCache: { day: string; total: number; at: number } | null = null;
let capCache: { cap: number; at: number } | null = null;

export async function recordSpend(e: SpendEvent): Promise<void> {
  const cost = typeof e.costUsd === "number" && e.costUsd >= 0 ? e.costUsd : estimateCostUsd(e.tokensIn, e.tokensOut);
  const d = day();
  if (todayCache && todayCache.day === d) todayCache.total += cost;
  try {
    await adminDb()
      .collection("aiSpend")
      .doc(d)
      .set(
        {
          total: FieldValue.increment(cost),
          calls: FieldValue.increment(1),
          tokensIn: FieldValue.increment(e.tokensIn),
          tokensOut: FieldValue.increment(e.tokensOut),
          byModel: { [safeKey(e.model)]: FieldValue.increment(cost) },
          byTask: { [safeKey(e.task)]: FieldValue.increment(cost) },
        },
        { merge: true }
      );
  } catch {
    /* counting must never break an answer */
  }
}

export async function getDailyCap(force = false): Promise<number> {
  if (!force && capCache && Date.now() - capCache.at < 30_000) return capCache.cap;
  let cap = DEFAULT_DAILY_CAP_USD;
  try {
    const doc = await adminDb().collection("systemConfig").doc("orBudget").get();
    const v = doc.exists ? Number(doc.data()?.dailyCapUsd) : NaN;
    if (Number.isFinite(v) && v >= 0) cap = v;
  } catch {
    /* keep the default */
  }
  capCache = { cap, at: Date.now() };
  return cap;
}

export function setCachedDailyCap(cap: number) {
  capCache = { cap, at: Date.now() };
}

export async function getSpendToday(force = false): Promise<number> {
  const d = day();
  if (!force && todayCache && todayCache.day === d && Date.now() - todayCache.at < 15_000) return todayCache.total;
  let total = 0;
  try {
    const doc = await adminDb().collection("aiSpend").doc(d).get();
    total = Number(doc.exists ? doc.data()?.total : 0) || 0;
  } catch {
    total = todayCache?.day === d ? todayCache.total : 0;
  }
  todayCache = { day: d, total, at: Date.now() };
  return total;
}

/** True when today's OpenRouter spending has reached the daily limit (a limit of 0 switches OpenRouter off). */
export async function overDailyCap(): Promise<{ over: boolean; spent: number; cap: number }> {
  const [spent, cap] = await Promise.all([getSpendToday(), getDailyCap()]);
  return { over: spent >= cap, spent, cap };
}
