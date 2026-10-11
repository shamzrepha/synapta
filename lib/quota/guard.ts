import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { AuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";

// In-memory sliding window rate limiting (max 10 calls per minute per user)
const userCallTimestamps = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_CALLS_PER_WINDOW = 10;

export class QuotaError extends ApiError {
  constructor(code: "QUOTA_EXCEEDED" | "RATE_LIMITED", message: string, status: number) {
    super(status, code, message);
    this.name = "QuotaError";
  }
}

/**
 * Checks in-memory sliding window rate limit and monthly quota.
 * Automatically resets monthly tokens if a new billing month (YYYY-MM) has begun.
 */
export async function checkRateLimitAndQuota(
  uid: string,
  estimatedTokens = 1000
): Promise<{ monthlyTokensUsed: number; monthlyTokenLimit: number }> {
  const now = Date.now();

  // 1. In-memory rate limiting check (10 calls/min)
  const timestamps = userCallTimestamps.get(uid) || [];
  const recentCalls = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recentCalls.length >= MAX_CALLS_PER_WINDOW) {
    throw new QuotaError(
      "RATE_LIMITED",
      "Rate limit exceeded (maximum 10 AI operations per minute). Please wait a moment.",
      429
    );
  }
  recentCalls.push(now);
  userCallTimestamps.set(uid, recentCalls);

  // 2. Monthly token quota check
  const userDoc = await adminDb().collection("users").doc(uid).get();
  if (!userDoc.exists) {
    throw new AuthError("UNAUTHENTICATED", "User record not found", 401);
  }

  const data = userDoc.data()!;
  const currentMonthStr = new Date().toISOString().slice(0, 7); // YYYY-MM
  const storedPeriod = data.usagePeriod || "";
  let monthlyTokensUsed = data.monthlyTokensUsed || 0;
  const monthlyTokenLimit = data.monthlyTokenLimit || 50000;

  // Monthly billing cycle rollover check
  if (storedPeriod !== currentMonthStr) {
    monthlyTokensUsed = 0;
    // Asynchronously record period rollover in user doc
    adminDb()
      .collection("users")
      .doc(uid)
      .update({
        monthlyTokensUsed: 0,
        usagePeriod: currentMonthStr,
        updatedAt: Timestamp.now(),
      })
      .catch((err) => console.warn("Failed to reset monthly tokens on period rollover:", err));
  }

  if (monthlyTokensUsed + estimatedTokens > monthlyTokenLimit && data.role !== "admin") {
    throw new QuotaError(
      "QUOTA_EXCEEDED",
      `Monthly AI token quota exceeded (${monthlyTokensUsed.toLocaleString()} / ${monthlyTokenLimit.toLocaleString()} tokens used). Quota resets at the beginning of next month.`,
      429
    );
  }

  return { monthlyTokensUsed, monthlyTokenLimit };
}

/**
 * Transactionally records token consumption in the user document and writes to
 * the aggregate monthly usage analytics collection.
 */
export async function recordTokenUsage(
  uid: string,
  tokensIn: number,
  tokensOut: number
): Promise<void> {
  const totalTokens = tokensIn + tokensOut;
  const currentMonthStr = new Date().toISOString().slice(0, 7); // YYYY-MM
  const usageDocId = `${uid}_${currentMonthStr}`;

  // Estimate cost: ~$0.075 per 1M input, ~$0.30 per 1M output for Gemini Flash
  const estimatedCostUsd = tokensIn * 0.000000075 + tokensOut * 0.0000003;

  const userRef = adminDb().collection("users").doc(uid);
  const usageRef = adminDb().collection("usage").doc(usageDocId);

  await adminDb().runTransaction(async (t) => {
    const userDoc = await t.get(userRef);
    const userData = userDoc.data();
    const storedPeriod = userData?.usagePeriod || "";

    if (storedPeriod !== currentMonthStr) {
      t.update(userRef, {
        monthlyTokensUsed: totalTokens,
        usagePeriod: currentMonthStr,
        updatedAt: Timestamp.now(),
      });
    } else {
      t.update(userRef, {
        monthlyTokensUsed: FieldValue.increment(totalTokens),
        updatedAt: Timestamp.now(),
      });
    }

    const usageDoc = await t.get(usageRef);
    if (usageDoc.exists) {
      t.update(usageRef, {
        tokensIn: FieldValue.increment(tokensIn),
        tokensOut: FieldValue.increment(tokensOut),
        calls: FieldValue.increment(1),
        estimatedCostUsd: FieldValue.increment(estimatedCostUsd),
        updatedAt: Timestamp.now(),
      });
    } else {
      t.set(usageRef, {
        uid,
        period: currentMonthStr,
        tokensIn,
        tokensOut,
        calls: 1,
        estimatedCostUsd,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    }
  });
}
