import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { AuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { evaluateSharedRateLimit } from "@/lib/rateLimit";

/**
 * AI budget enforcement.
 *
 * - Rate limit: shared across serverless instances (a Firestore counter per user and minute), with an explicit,
 *   logged per-instance fallback if Firestore is unreachable.
 * - Monthly tokens: a request RESERVES its estimated tokens in a transaction before the model is called. The
 *   reservation counts against the same budget as tokens already used, so concurrent requests cannot all pass a
 *   stale "you still have room" check and then overspend. When the call finishes the reservation is settled against the
 *   real usage; on failure it is released, so a failed or retried call is never charged twice.
 * - A reservation that is never settled (a crashed instance) stops counting after RESERVATION_TTL_MS.
 */
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_CALLS_PER_WINDOW = 10;
const TEACHER_MAX_CALLS_PER_WINDOW = 60;
export const RESERVATION_TTL_MS = 10 * 60 * 1000;
const STUDENT_DEFAULT_LIMIT = 50_000;
const TEACHER_DEFAULT_LIMIT = 10_000_000;

export class QuotaError extends ApiError {
  constructor(code: "QUOTA_EXCEEDED" | "RATE_LIMITED", message: string, status: number, headers?: Record<string, string>) {
    super(status, code, message, headers);
    this.name = "QuotaError";
  }
}

const currentPeriod = () => new Date().toISOString().slice(0, 7); // YYYY-MM

interface UserBudget {
  isTeacherOrAdmin: boolean;
  used: number;
  limit: number;
}

function budgetOf(data: FirebaseFirestore.DocumentData, period: string): UserBudget {
  const isTeacherOrAdmin = data.role === "teacher" || data.role === "admin";
  return {
    isTeacherOrAdmin,
    // a new billing month starts from zero
    used: (data.usagePeriod || "") === period ? data.monthlyTokensUsed || 0 : 0,
    limit: data.monthlyTokenLimit || (isTeacherOrAdmin ? TEACHER_DEFAULT_LIMIT : STUDENT_DEFAULT_LIMIT),
  };
}

const quotaMessage = (used: number, limit: number) =>
  `Monthly AI token quota exceeded (${used.toLocaleString()} / ${limit.toLocaleString()} tokens used or in progress). Quota resets at the beginning of next month.`;

/**
 * Admission check at the start of an AI request: rate limit (shared) and a monthly-budget check that includes
 * reservations already in flight. It does not reserve anything: the model call reserves its own estimate.
 */
export async function checkRateLimitAndQuota(uid: string, estimatedTokens = 1000): Promise<{ monthlyTokensUsed: number; monthlyTokenLimit: number }> {
  const userDoc = await adminDb().collection("users").doc(uid).get();
  if (!userDoc.exists) throw new AuthError("UNAUTHENTICATED", "User record not found", 401);
  const period = currentPeriod();
  const b = budgetOf(userDoc.data()!, period);

  const maxCalls = b.isTeacherOrAdmin ? TEACHER_MAX_CALLS_PER_WINDOW : MAX_CALLS_PER_WINDOW;
  const rate = await evaluateSharedRateLimit(`user:${uid}:ai`, maxCalls, RATE_LIMIT_WINDOW_MS);
  if (!rate.success) {
    throw new QuotaError("RATE_LIMITED", "Rate limit exceeded. Please wait a moment before trying again.", 429, { "Retry-After": String(Math.max(1, Math.ceil(rate.resetMs / 1000))) });
  }

  if (!b.isTeacherOrAdmin) {
    const outstanding = await outstandingReservations(uid);
    if (b.used + outstanding + estimatedTokens > b.limit) {
      throw new QuotaError("QUOTA_EXCEEDED", quotaMessage(b.used + outstanding, b.limit), 429);
    }
  }
  return { monthlyTokensUsed: b.used, monthlyTokenLimit: b.limit };
}

async function outstandingReservations(uid: string, now = Date.now()): Promise<number> {
  const snap = await adminDb().collection("quotaReservations").where("uid", "==", uid).where("status", "==", "open").get();
  return snap.docs.reduce((sum, d) => (Number(d.data().expiresAtMs) > now ? sum + (Number(d.data().tokens) || 0) : sum), 0);
}

export interface QuotaReservation {
  /** null for teachers/admins, who have no monthly cap (their usage is still recorded when settled) */
  id: string | null;
  uid: string;
  tokens: number;
}

/**
 * Reserves `estimatedTokens` of the user's monthly budget in one transaction. Throws QUOTA_EXCEEDED when the tokens
 * already used plus the reservations in flight plus this estimate would pass the limit.
 */
export async function reserveQuota(uid: string, estimatedTokens: number, now = Date.now()): Promise<QuotaReservation> {
  const db = adminDb();
  const userRef = db.collection("users").doc(uid);
  const period = currentPeriod();
  return db.runTransaction(async (t) => {
    const userSnap = await t.get(userRef);
    if (!userSnap.exists) throw new AuthError("UNAUTHENTICATED", "User record not found", 401);
    const b = budgetOf(userSnap.data()!, period);
    if (b.isTeacherOrAdmin) return { id: null, uid, tokens: estimatedTokens };

    const open = await t.get(db.collection("quotaReservations").where("uid", "==", uid).where("status", "==", "open"));
    const outstanding = open.docs.reduce((sum, d) => (Number(d.data().expiresAtMs) > now ? sum + (Number(d.data().tokens) || 0) : sum), 0);
    if (b.used + outstanding + estimatedTokens > b.limit) {
      throw new QuotaError("QUOTA_EXCEEDED", quotaMessage(b.used + outstanding, b.limit), 429);
    }
    const ref = db.collection("quotaReservations").doc();
    t.set(ref, {
      uid,
      tokens: estimatedTokens,
      status: "open",
      period,
      createdAtMs: now,
      expiresAtMs: now + RESERVATION_TTL_MS,
      purgeAt: Timestamp.fromMillis(now + 7 * 24 * 3_600_000),
    });
    return { id: ref.id, uid, tokens: estimatedTokens };
  });
}

/**
 * Settles a reservation against what the call really used. Safe to call twice (a retry): only an open reservation is
 * charged, so the same request can never be billed twice.
 */
export async function settleQuota(reservation: QuotaReservation | null, tokensIn: number, tokensOut: number): Promise<boolean> {
  if (!reservation) return false;
  if (!reservation.id) {
    await recordTokenUsage(reservation.uid, tokensIn, tokensOut);
    return true;
  }
  const db = adminDb();
  const resRef = db.collection("quotaReservations").doc(reservation.id);
  return db.runTransaction(async (t) => {
    const snap = await t.get(resRef);
    if (!snap.exists || snap.data()?.status !== "open") return false; // already settled or released
    await applyUsage(t, reservation.uid, tokensIn, tokensOut, () => t.update(resRef, { status: "settled", settledAt: Timestamp.now(), actualTokens: tokensIn + tokensOut }));
    return true;
  });
}

/** Gives the reserved tokens back (the call failed or produced nothing). Idempotent. */
export async function releaseQuota(reservation: QuotaReservation | null): Promise<void> {
  if (!reservation?.id) return;
  const resRef = adminDb().collection("quotaReservations").doc(reservation.id);
  await adminDb().runTransaction(async (t) => {
    const snap = await t.get(resRef);
    if (snap.exists && snap.data()?.status === "open") t.update(resRef, { status: "released", releasedAt: Timestamp.now() });
  });
}

/**
 * Reads then writes the user's monthly counter and the usage analytics document inside the caller's transaction.
 * `alsoWrite` runs after the reads, so a reservation update can be part of the same atomic commit.
 */
async function applyUsage(t: FirebaseFirestore.Transaction, uid: string, tokensIn: number, tokensOut: number, alsoWrite?: () => void) {
  const totalTokens = tokensIn + tokensOut;
  const period = currentPeriod();
  const userRef = adminDb().collection("users").doc(uid);
  const usageRef = adminDb().collection("usage").doc(`${uid}_${period}`);
  // Estimate cost: ~$0.075 per 1M input, ~$0.30 per 1M output for Gemini Flash
  const estimatedCostUsd = tokensIn * 0.000000075 + tokensOut * 0.0000003;

  // Firestore requires every read in a transaction to happen before any write
  const [userDoc, usageDoc] = await Promise.all([t.get(userRef), t.get(usageRef)]);
  const storedPeriod = userDoc.data()?.usagePeriod || "";

  if (storedPeriod !== period) {
    t.update(userRef, { monthlyTokensUsed: totalTokens, usagePeriod: period, updatedAt: Timestamp.now() });
  } else {
    t.update(userRef, { monthlyTokensUsed: FieldValue.increment(totalTokens), updatedAt: Timestamp.now() });
  }

  if (usageDoc.exists) {
    t.update(usageRef, {
      tokensIn: FieldValue.increment(tokensIn),
      tokensOut: FieldValue.increment(tokensOut),
      calls: FieldValue.increment(1),
      estimatedCostUsd: FieldValue.increment(estimatedCostUsd),
      updatedAt: Timestamp.now(),
    });
  } else {
    t.set(usageRef, { uid, period, tokensIn, tokensOut, calls: 1, estimatedCostUsd, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  }
  alsoWrite?.();
}

/**
 * Transactionally records token consumption in the user document and writes to the aggregate monthly usage
 * analytics collection. Used for callers that have no reservation (teachers/admins, background usage).
 */
export async function recordTokenUsage(uid: string, tokensIn: number, tokensOut: number): Promise<void> {
  await adminDb().runTransaction(async (t) => {
    await applyUsage(t, uid, tokensIn, tokensOut);
  });
}
