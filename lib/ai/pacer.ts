import { KNOWN_MODELS } from "./models";

interface Bucket {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRatePerMs: number;
}

const modelBuckets = new Map<string, Bucket>();

function getModelRpm(model: string): number {
  const envKey = `GEMINI_RPM_${model.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  const envVal = process.env[envKey];
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  const meta = KNOWN_MODELS[model];
  if (meta) return meta.rpm;
  return model.includes("lite") ? 15 : 5;
}

function getBucket(model: string): Bucket {
  let bucket = modelBuckets.get(model);
  if (!bucket) {
    const rpm = getModelRpm(model);
    bucket = {
      tokens: rpm,
      lastRefill: Date.now(),
      maxTokens: rpm,
      refillRatePerMs: rpm / 60000,
    };
    modelBuckets.set(model, bucket);
  }
  return bucket;
}

function refillBucket(bucket: Bucket) {
  const now = Date.now();
  const elapsed = now - bucket.lastRefill;
  if (elapsed > 0) {
    bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + elapsed * bucket.refillRatePerMs);
    bucket.lastRefill = now;
  }
}

/**
 * Paces requests to respect model RPM rate limits.
 * Waits if burst rate is currently exhausted, up to timeoutMs (default 20s).
 */
export async function acquireModelSlot(model: string, timeoutMs = 20000): Promise<void> {
  const bucket = getBucket(model);
  const startTime = Date.now();

  while (Date.now() - startTime <= timeoutMs) {
    refillBucket(bucket);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return;
    }

    // Calculate wait time for at least 1 token
    const neededTokens = 1 - bucket.tokens;
    const waitMs = Math.min(2500, Math.max(100, Math.ceil(neededTokens / bucket.refillRatePerMs)));

    if (Date.now() - startTime + waitMs > timeoutMs) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  // If timeout exceeded, proceed with warning to avoid hanging user request
  console.warn(`[lib/ai/pacer] RPM pacing timeout reached for "${model}". Proceeding with request.`);
}
