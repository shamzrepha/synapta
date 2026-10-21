import { getServerEnv, DEFAULT_GEMINI_MODEL } from "@/lib/env";
import { getGeminiClient } from "@/lib/gemini/client";
import { checkRateLimitAndQuota, reserveQuota, settleQuota, releaseQuota } from "@/lib/quota/guard";
import { z } from "zod";
import {
  DEFAULT_MODEL_CONFIG,
  isRetiredModel,
  taskGroup,
  isHeavyTask,
  parseModelChain,
  sanitizeModelId,
} from "./models";
import { acquireModelSlot } from "./pacer";
import {
  isModelAvailable,
  markModelExhausted,
  clearModelExhausted,
  markModelInvalid,
  recordModelUsage,
  calculatePacificMidnightReset,
  isWithinModelReserve,
} from "./health";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";

import { AiTaskKey } from "./tasks";

export { sanitizeModelId, DEFAULT_GEMINI_MODEL };

export type AiTask = AiTaskKey | (string & {});

export class AiQuotaExhaustedError extends ApiError {
  public resumeAt: string;
  public resumeTimestampMs: number;

  constructor(resumeAt: string, resumeTimestampMs: number) {
    const retryAfter = Math.max(1, Math.ceil((resumeTimestampMs - Date.now()) / 1000)).toString();
    super(
      429,
      "AI_QUOTA_EXHAUSTED",
      `The AI is at its daily limit. Your upload is saved and will be analysed automatically after ${resumeAt}, or you can retry later.`,
      { "Retry-After": retryAfter }
    );
    this.name = "AiQuotaExhaustedError";
    this.resumeAt = resumeAt;
    this.resumeTimestampMs = resumeTimestampMs;
  }
}

/**
 * Raised when the AI produced output we could not use (bad JSON, schema mismatch, safety block,
 * unexpected provider error) WITHOUT any quota exhaustion. Kept distinct from AiQuotaExhaustedError
 * so users are never told "the AI is at its daily limit" when the real problem is a bad response.
 */
export class AiGenerationError extends ApiError {
  constructor(message = "The AI couldn't produce a usable answer this time. Please try again in a moment.") {
    super(502, "AI_GENERATION_FAILED", message);
    this.name = "AiGenerationError";
  }
}

/** Raised when the Gemini API key is missing, invalid or lacks permission. */
export class AiNotConfiguredError extends ApiError {
  constructor() {
    super(
      503,
      "AI_NOT_CONFIGURED",
      "The AI service isn't configured correctly (missing or invalid GEMINI_API_KEY). Ask an admin to check the server settings."
    );
    this.name = "AiNotConfiguredError";
  }
}

/**
 * Extracts a JSON value from model output. Models frequently wrap JSON in ```json fences or add a
 * sentence before/after it even in JSON mode; this recovers the payload instead of failing the call.
 */
export function extractJsonPayload(text: string): unknown {
  const trimmed = (text || "").trim();
  if (!trimmed) throw new Error("Empty AI response");
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to recovery strategies
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // fall through
    }
  }
  const firstObj = trimmed.indexOf("{");
  const firstArr = trimmed.indexOf("[");
  const starts = [firstObj, firstArr].filter((i) => i >= 0);
  if (starts.length > 0) {
    const start = Math.min(...starts);
    const closer = trimmed[start] === "{" ? "}" : "]";
    const end = trimmed.lastIndexOf(closer);
    if (end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
  }
  throw new Error("AI response did not contain JSON");
}

export interface CallBudget {
  maxCalls: number;
  usedCalls: number;
  actionName: string;
}

export function createCallBudget(actionName: "class_build" | "material_upload", pageCount = 0): CallBudget {
  const maxCalls = actionName === "class_build" ? 3 : Math.max(2, 2 + Math.floor(pageCount / 40));
  return { maxCalls, usedCalls: 0, actionName };
}

let cachedDynamicModels: Record<string, string> | null = null;
let lastDynamicModelsFetchMs = 0;

export async function getDynamicModelConfig(): Promise<Record<string, string>> {
  const now = Date.now();
  // Invalidate after 10s so changes apply rapidly across serverless instances
  if (cachedDynamicModels && now - lastDynamicModelsFetchMs < 10000) {
    return cachedDynamicModels;
  }
  try {
    const doc = await adminDb().collection("systemConfig").doc("aiModels").get();
    if (doc.exists) {
      cachedDynamicModels = (doc.data() as Record<string, string>) || {};
    } else {
      cachedDynamicModels = {};
    }
  } catch {
    cachedDynamicModels = cachedDynamicModels || {};
  }
  lastDynamicModelsFetchMs = now;
  return cachedDynamicModels;
}

export function setCachedDynamicModels(config: Record<string, string>) {
  cachedDynamicModels = config;
  lastDynamicModelsFetchMs = Date.now();
}

/**
 * Resolves the model chain asynchronously and guaranteed fresh for a given task.
 * Per Fix Pack D: Zero hardcoded models appended behind the admin's back.
 */
export async function resolveModelChain(task: AiTask): Promise<string[]> {
  await getDynamicModelConfig();
  return getChainForTask(task);
}

/**
 * Returns the configured Gemini model identifier for a given task.
 * Honors dynamic admin configuration if set, falling back to server environment variables.
 */
export function modelFor(task: AiTask): string {
  const adminModel = cachedDynamicModels?.[task];
  if (adminModel && !isRetiredModel(adminModel)) {
    return adminModel;
  }
  const configured = configuredModelFor(task);
  return isRetiredModel(configured) ? defaultModelFor(task) : configured;
}

function defaultModelFor(task: AiTask): string {
  switch (taskGroup(task)) {
    case "tutor":
      return DEFAULT_MODEL_CONFIG.tutor;
    case "structured":
      return DEFAULT_MODEL_CONFIG.structured;
    case "longdoc":
      return DEFAULT_MODEL_CONFIG.longdoc;
    case "build":
      return DEFAULT_MODEL_CONFIG.build;
    case "grading":
      return DEFAULT_MODEL_CONFIG.grading;
    case "voice":
      return DEFAULT_MODEL_CONFIG.voice;
    default:
      return "gemini-3.5-flash-lite";
  }
}

function configuredModelFor(task: AiTask): string {
  const group = taskGroup(task);
  try {
    const env = getServerEnv();
    switch (group) {
      case "tutor":
        return env.GEMINI_MODEL_TUTOR;
      case "structured":
        return env.GEMINI_MODEL_STRUCTURED;
      case "longdoc":
        return env.GEMINI_MODEL_LONGDOC;
      case "build":
        return env.GEMINI_MODEL_BUILD;
      case "grading":
        return env.GEMINI_MODEL_GRADING;
      case "voice":
        return env.GEMINI_MODEL_VOICE;
      default:
        return env.GEMINI_MODEL_FALLBACK;
    }
  } catch {
    switch (group) {
      case "tutor":
        return process.env.GEMINI_MODEL_TUTOR || DEFAULT_MODEL_CONFIG.tutor;
      case "structured":
        return process.env.GEMINI_MODEL_STRUCTURED || DEFAULT_MODEL_CONFIG.structured;
      case "longdoc":
        return process.env.GEMINI_MODEL_LONGDOC || DEFAULT_MODEL_CONFIG.longdoc;
      case "build":
        return process.env.GEMINI_MODEL_BUILD || DEFAULT_MODEL_CONFIG.build;
      case "grading":
        return process.env.GEMINI_MODEL_GRADING || DEFAULT_MODEL_CONFIG.grading;
      case "voice":
        return process.env.GEMINI_MODEL_VOICE || DEFAULT_MODEL_CONFIG.voice;
      default:
        return process.env.GEMINI_MODEL_FALLBACK || "gemini-3.5-flash-lite";
    }
  }
}

export function fallbackModel(): string {
  try {
    const env = getServerEnv();
    return env.GEMINI_MODEL_FALLBACK;
  } catch {
    return process.env.GEMINI_MODEL_FALLBACK || "gemini-3.5-flash-lite";
  }
}

/**
 * Resolves the candidate chain of models for a task according to two-tier rules:
 * - Light tasks stay strictly within the light chain (never burn heavy 20/day buckets).
 * - Heavy tasks walk the heavy chain first, and as a last resort drop to light chain.
 * - Custom GEMINI_FALLBACK_CHAIN if configured is deduplicated and respected.
 */
export function getChainForTask(task: AiTask): string[] {
  let lightChain: string[] = DEFAULT_MODEL_CONFIG.chainLight;
  let heavyChain: string[] = DEFAULT_MODEL_CONFIG.chainHeavy;
  let customFallbackChain: string[] = [];

  try {
    const env = getServerEnv();
    lightChain = parseModelChain(env.GEMINI_CHAIN_LIGHT, DEFAULT_MODEL_CONFIG.chainLight);
    heavyChain = parseModelChain(env.GEMINI_CHAIN_HEAVY, DEFAULT_MODEL_CONFIG.chainHeavy);
    if (env.GEMINI_FALLBACK_CHAIN) {
      customFallbackChain = parseModelChain(env.GEMINI_FALLBACK_CHAIN, []);
    }
  } catch {
    lightChain = parseModelChain(process.env.GEMINI_CHAIN_LIGHT, DEFAULT_MODEL_CONFIG.chainLight);
    heavyChain = parseModelChain(process.env.GEMINI_CHAIN_HEAVY, DEFAULT_MODEL_CONFIG.chainHeavy);
    if (process.env.GEMINI_FALLBACK_CHAIN) {
      customFallbackChain = parseModelChain(process.env.GEMINI_FALLBACK_CHAIN, []);
    }
  }

  const primary = modelFor(task);

  // Admin-configured fallback chain (systemConfig/aiModels.fallbackChain, comma separated)
  const adminChainRaw = cachedDynamicModels?.fallbackChain;
  if (typeof adminChainRaw === "string" && adminChainRaw.trim()) {
    customFallbackChain = parseModelChain(adminChainRaw, []);
  }

  const live = (list: string[]) => Array.from(new Set(list.filter((m) => m && !isRetiredModel(m))));
  // Safety net: current default light models go last, so a stale custom chain can't take every AI feature down
  const safetyNet = DEFAULT_MODEL_CONFIG.chainLight;

  if (customFallbackChain.length > 0) {
    return live([primary, ...customFallbackChain, ...safetyNet]);
  }

  if (!isHeavyTask(task)) {
    // Everything that isn't a build/grading job stays within light models (keeps the small heavy quota for where it matters)
    return live([primary, ...lightChain, ...safetyNet]);
  }

  // Heavy tasks walk heavy chain first, and as last resort drop to light chain
  return live([primary, ...heavyChain, ...lightChain, ...safetyNet]);
}

export interface ClassifiedError {
  type: "daily_exhaustion" | "rate_limit_minute" | "invalid_model" | "transient" | "auth" | "unrecoverable";
  retryDelaySeconds?: number;
  message: string;
}

/**
 * Classifies Google Gemini provider errors into structured operational categories.
 */
export function classifyProviderError(err: unknown): ClassifiedError {
  if (!err) return { type: "unrecoverable", message: "Unknown error" };

  const errObj = (typeof err === "object" && err !== null) ? (err as Record<string, unknown>) : {};
  const rawMsg = err instanceof Error ? err.message : String(err);
  const msg = rawMsg.toLowerCase();

  let quotaId = "";
  let retryDelay = 0;

  const details = Array.isArray(errObj.details) ? errObj.details : [];
  for (const d of details) {
    if (typeof d === "object" && d !== null) {
      const dRec = d as Record<string, unknown>;
      if (Array.isArray(dRec.violations)) {
        for (const v of dRec.violations) {
          if (typeof v === "object" && v !== null && (v as Record<string, unknown>).quotaId) {
            quotaId = String((v as Record<string, unknown>).quotaId);
          }
        }
      }
      if (dRec.retryDelay) {
        const match = String(dRec.retryDelay).match(/(\d+)/);
        if (match) retryDelay = parseInt(match[1], 10);
      }
    }
  }

  // Daily quota exhaustion (PerDay or retryDelay > 10 min)
  if (
    quotaId.toLowerCase().includes("perday") ||
    retryDelay > 600 ||
    msg.includes("perday") ||
    msg.includes("generaterequestsperday") ||
    msg.includes("daily limit")
  ) {
    return {
      type: "daily_exhaustion",
      retryDelaySeconds: retryDelay || undefined,
      message: "Daily free-tier quota exhausted",
    };
  }

  // Minute / Burst Rate limit
  if (
    quotaId.toLowerCase().includes("perminute") ||
    (retryDelay > 0 && retryDelay <= 60) ||
    msg.includes("429") ||
    msg.includes("resource_exhausted") ||
    msg.includes("quota exceeded")
  ) {
    return {
      type: "rate_limit_minute",
      retryDelaySeconds: retryDelay || 5,
      message: "Per-minute rate limit reached",
    };
  }

  // Invalid / missing API key or permission problems: no model in the chain will work
  if (
    msg.includes("api_key_invalid") ||
    msg.includes("api key not valid") ||
    msg.includes("permission_denied") ||
    msg.includes("unauthenticated") ||
    msg.includes("gemini_api_key is not configured")
  ) {
    return { type: "auth", message: "Gemini API key invalid or missing" };
  }

  // Invalid or deprecated model (404)
  if (
    msg.includes("not found") ||
    msg.includes("404") ||
    msg.includes("deprecated") ||
    msg.includes("not supported")
  ) {
    return {
      type: "invalid_model",
      message: "Model identifier not found or deprecated",
    };
  }

  // Transient service errors
  if (msg.includes("503") || msg.includes("unavailable") || msg.includes("internal error")) {
    return {
      type: "transient",
      message: "Transient Gemini service error",
    };
  }

  return {
    type: "unrecoverable",
    message: rawMsg,
  };
}

export interface GenerateWithFallbackOptions<T> {
  task: AiTask;
  userPrompt?: string;
  contents?: unknown;
  systemInstruction?: string;
  tools?: unknown[];
  temperature?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema?: z.ZodType<T, z.ZodTypeDef, any>;
  userId?: string;
  budget?: CallBudget;
  isPrivileged?: boolean;
  cacheKey?: string;
  maxRetriesPerModel?: number;
  /**
   * Longest this call may spend waiting for a rate-limited model before it moves on / gives up (ms). A live chat has
   * someone watching, so it should fail fast with a clear message instead of looking frozen.
   */
  maxWaitMs?: number;
  /** tokens to reserve from the user's monthly budget before calling a model (defaults by task) */
  estimatedTokens?: number;
}

/** Heavy generation tasks reserve more of the budget than a short chat reply. */
const HEAVY_ESTIMATE = 8000;
const LIGHT_ESTIMATE = 1500;
function defaultEstimate(task: AiTask): number {
  return isHeavyTask(task) ? HEAVY_ESTIMATE : LIGHT_ESTIMATE;
}

export interface GenerateWithFallbackResult<T> {
  text: string;
  data?: T;
  functionCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  fallbackTriggered: boolean;
  reducedQuality?: boolean;
  /** web pages the answer was grounded on (when the Google Search tool was used) */
  sources?: Array<{ title: string; uri: string }>;
}

/**
 * Universal quota-aware AI execution pipeline with multi-tier fallback,
 * RPM pacing, budget guard, cache lookups, and PII-safe error masking.
 */
export async function generateWithFallback<T>(opts: GenerateWithFallbackOptions<T>): Promise<GenerateWithFallbackResult<T>> {
  // Not on behalf of a user (health probes, system jobs): nothing to charge
  if (!opts.userId) return generateWithFallbackInner(opts, false);

  // Reserve the estimate before spending anything (rejects with QUOTA_EXCEEDED when the budget can't cover it),
  // then settle against real usage, or release if the call fails, so retries and failures are never charged twice.
  const reservation = await reserveQuota(opts.userId, opts.estimatedTokens ?? defaultEstimate(opts.task));
  let result: GenerateWithFallbackResult<T>;
  try {
    result = await generateWithFallbackInner(opts, true);
  } catch (err) {
    await releaseQuota(reservation).catch((e) => console.error(`[quota] could not release a reservation for ${opts.userId}:`, e instanceof Error ? e.message : e));
    throw err;
  }
  // a cached answer used no tokens: give the reservation back instead of recording an empty call
  if (result.tokensIn + result.tokensOut === 0) {
    await releaseQuota(reservation).catch(() => undefined);
    return result;
  }
  await settleQuota(reservation, result.tokensIn, result.tokensOut).catch((e) =>
    // the answer was generated and the user gets it; the reservation stays open and stops counting when it expires
    console.error(`[quota] could not settle ${result.tokensIn + result.tokensOut} tokens for ${opts.userId}:`, e instanceof Error ? e.message : e)
  );
  return result;
}

async function generateWithFallbackInner<T>({
  task,
  userPrompt,
  contents,
  systemInstruction,
  tools,
  temperature,
  schema,
  userId,
  budget,
  isPrivileged = false,
  cacheKey,
  maxRetriesPerModel = 2,
  maxWaitMs,
}: GenerateWithFallbackOptions<T>, _reserved: boolean): Promise<GenerateWithFallbackResult<T>> {
  const startTime = Date.now();

  // 1. Budget Guard Check
  if (budget) {
    if (budget.usedCalls >= budget.maxCalls) {
      throw new Error(`Call budget exhausted (${budget.usedCalls}/${budget.maxCalls} calls used for ${budget.actionName})`);
    }
    budget.usedCalls++;
  }

  // 2. Cache Lookup
  if (cacheKey) {
    try {
      const cacheRef = adminDb().collection("aiCache").doc(cacheKey);
      const cachedSnap = await cacheRef.get();
      if (cachedSnap.exists) {
        const cData = cachedSnap.data() || {};
        return {
          text: cData.text || "",
          data: cData.data as T | undefined,
          modelUsed: cData.modelUsed || "cache",
          tokensIn: 0,
          tokensOut: 0,
          latencyMs: Date.now() - startTime,
          fallbackTriggered: false,
        };
      }
    } catch {}
  }

  let ai: ReturnType<typeof getGeminiClient>;
  try {
    ai = getGeminiClient();
  } catch {
    throw new AiNotConfiguredError();
  }
  // Always load admin-assigned models BEFORE resolving the chain (serverless cold starts
  // otherwise ignore admin configuration and fall back to env/default models).
  await getDynamicModelConfig();
  const chain = getChainForTask(task);
  const primaryModel = chain[0];

  let fallbackTriggered = false;
  let lastError: unknown = null;
  let attemptedAny = false;
  // True once any model was skipped or failed for quota reasons. Only then do we report quota exhaustion.
  let sawQuotaProblem = false;

  for (let i = 0; i < chain.length; i++) {
    const activeModel = chain[i];

    // Privileged (teacher class-building) calls never pre-emptively skip a model based on
    // local counters or cached cooldowns; only a real provider error moves us along the chain.
    if (!isPrivileged) {
      const available = await isModelAvailable(activeModel);
      if (!available) {
        fallbackTriggered = true;
        sawQuotaProblem = true;
        continue;
      }

      const withinReserve = await isWithinModelReserve(activeModel, false);
      if (!withinReserve) {
        console.warn(`[lib/ai/router] Model "${activeModel}" is at or above 90% reserve. Skipping to next candidate.`);
        fallbackTriggered = true;
        sawQuotaProblem = true;
        continue;
      }
    }

    let attempt = 0;
    while (attempt <= maxRetriesPerModel) {
      try {
        attemptedAny = true;
        // Pacing slot
        await acquireModelSlot(activeModel);

        const config: Record<string, unknown> = {
          systemInstruction,
        };
        if (typeof temperature === "number") {
          config.temperature = temperature;
        }
        if (tools && tools.length > 0) {
          config.tools = tools;
        }
        if (schema) {
          config.responseMimeType = "application/json";
        }

        const callContents = contents !== undefined ? contents : userPrompt;

        const response = await ai.models.generateContent({
          model: activeModel,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          contents: callContents as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          config: config as any,
        });

        const responseText = response.text || "";
        const tokensIn = response.usageMetadata?.promptTokenCount || 500;
        const tokensOut = response.usageMetadata?.candidatesTokenCount || 600;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawFunctionCalls = (response as any).functionCalls;
        const functionCalls = Array.isArray(rawFunctionCalls)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? rawFunctionCalls.map((fc: any) => ({
              name: String(fc.name || "unknown"),
              args: (fc.args as Record<string, unknown>) || {},
            }))
          : undefined;

        let parsedData: T | undefined = undefined;
        if (schema) {
          let rawJson: unknown;
          try {
            rawJson = extractJsonPayload(responseText);
          } catch (jsonErr) {
            throw new Error(`Failed to parse AI output as JSON: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`);
          }
          const val = schema.safeParse(rawJson);
          if (!val.success) {
            if (attempt === maxRetriesPerModel) {
              throw new Error(`AI generated JSON did not match expected schema: ${val.error.message}`);
            }
            attempt++;
            await new Promise((r) => setTimeout(r, 500 * attempt));
            continue;
          }
          parsedData = val.data;
        }

        // Record metrics
        await recordModelUsage(activeModel, tokensIn, tokensOut).catch(() => {});
        // Unmark model if previously flagged exhausted
        clearModelExhausted(activeModel).catch(() => {});
        // usage is settled against the reservation by generateWithFallback (one charge per request)

        // Cache result if key provided
        if (cacheKey) {
          adminDb().collection("aiCache").doc(cacheKey).set({
            text: responseText,
            data: parsedData || null,
            modelUsed: activeModel,
            createdAt: new Date().toISOString(),
          }).catch(() => {});
        }

        const reducedQuality = activeModel.includes("lite") && isHeavyTask(task);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chunks = (response as any).candidates?.[0]?.groundingMetadata?.groundingChunks;
        const sources = Array.isArray(chunks)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? (chunks as any[]).map((c) => ({ title: String(c?.web?.title || c?.web?.uri || ""), uri: String(c?.web?.uri || "") })).filter((c) => /^https?:\/\//.test(c.uri)).slice(0, 12)
          : undefined;

        return {
          text: responseText,
          data: parsedData,
          sources,
          functionCalls,
          modelUsed: activeModel,
          tokensIn,
          tokensOut,
          latencyMs: Date.now() - startTime,
          fallbackTriggered: fallbackTriggered || activeModel !== primaryModel,
          reducedQuality,
        };
      } catch (err: unknown) {
        lastError = err;
        const classified = classifyProviderError(err);

        if (classified.type === "auth") {
          throw new AiNotConfiguredError();
        }

        if (classified.type === "daily_exhaustion") {
          sawQuotaProblem = true;
          console.warn(`[model_fallback] Model "${activeModel}" daily quota exhausted for task "${task}". Marking exhausted until reset.`);
          await markModelExhausted(activeModel, classified.retryDelaySeconds);
          fallbackTriggered = true;
          break; // Advance to next model in chain
        }

        if (classified.type === "invalid_model") {
          console.warn(`[model_fallback] Model "${activeModel}" is invalid/404. Marking invalid for 1 hour.`);
          await markModelInvalid(activeModel);
          fallbackTriggered = true;
          break; // Advance to next model in chain
        }

        if (classified.type === "rate_limit_minute") {
          sawQuotaProblem = true;
          const waitSec = Math.min(20, classified.retryDelaySeconds || 5);
          // someone is waiting on this answer: don't sit out the limit, move to the next model or report it
          if (maxWaitMs !== undefined && Date.now() - startTime + waitSec * 1000 > maxWaitMs) {
            console.warn(`[model_pacer] Rate limited on "${activeModel}"; not waiting ${waitSec}s (limit ${maxWaitMs} ms).`);
            fallbackTriggered = true;
            break;
          }
          console.warn(`[model_pacer] Rate limited on "${activeModel}". Waiting ${waitSec}s...`);
          await new Promise((r) => setTimeout(r, waitSec * 1000));
          attempt++;
          continue;
        }

        if (classified.type === "transient") {
          attempt++;
          if (attempt > maxRetriesPerModel) break;
          await new Promise((r) => setTimeout(r, 600 * attempt));
          continue;
        }

        // Unrecoverable schema or parsing error
        attempt++;
        if (attempt > maxRetriesPerModel) break;
      }
    }
  }

  // If all models in the chain were skipped due to health/reserve flags,
  // do NOT give up without attempting a direct call on the primary model.
  // This prevents false lockouts from stale Firestore exhaustion state.
  if (!attemptedAny) {
    const probeModel = primaryModel;
    try {
      await acquireModelSlot(probeModel);
      const config: Record<string, unknown> = { systemInstruction };
      if (schema) config.responseMimeType = "application/json";

      const callContents = contents !== undefined ? contents : (userPrompt || "");
      const response = await ai.models.generateContent({
        model: probeModel,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contents: callContents as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config: config as any,
      });

      const responseText = response.text || "";
      const tokensIn = response.usageMetadata?.promptTokenCount || 500;
      const tokensOut = response.usageMetadata?.candidatesTokenCount || 600;

      let parsedData: T | undefined = undefined;
      if (schema) {
        let rawJson: unknown;
        try {
          rawJson = extractJsonPayload(responseText);
        } catch (jsonErr) {
          throw new Error(`Failed to parse AI output as JSON: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`);
        }
        parsedData = schema.parse(rawJson);
      }

      await clearModelExhausted(probeModel).catch(() => {});
      await recordModelUsage(probeModel, tokensIn, tokensOut).catch(() => {});

      if (cacheKey) {
        adminDb().collection("aiCache").doc(cacheKey).set({
          text: responseText,
          data: parsedData || null,
          modelUsed: probeModel,
          createdAt: new Date().toISOString(),
        }).catch(() => {});
      }

      return {
        text: responseText,
        data: parsedData,
        modelUsed: probeModel,
        tokensIn,
        tokensOut,
        latencyMs: Date.now() - startTime,
        fallbackTriggered: true,
      };
    } catch (probeErr) {
      lastError = probeErr;
      const classified = classifyProviderError(probeErr);
      if (classified.type === "auth") {
        throw new AiNotConfiguredError();
      }
      if (classified.type === "daily_exhaustion") {
        await markModelExhausted(probeModel, classified.retryDelaySeconds);
      }
    }
  }

  if (lastError) {
    console.warn(`[lib/ai/router] All models failed for task "${task}". Last error:`, lastError instanceof Error ? lastError.message : String(lastError));
  }
  // Only blame quota when quota was actually the problem; otherwise surface a retryable generation error.
  if (!sawQuotaProblem) {
    throw new AiGenerationError();
  }
  const reset = calculatePacificMidnightReset();
  throw new AiQuotaExhaustedError(reset.display, reset.timestampMs);
}

/**
 * Adapter implementing ExecuteStructuredAiTask via unified generateWithFallback pipeline.
 */
export async function executeStructuredAiTask<T>({
  task,
  systemInstruction,
  userPrompt,
  schema,
  userId,
  estimatedTokens = 1000,
  isPrivileged,
}: {
  task: AiTask;
  systemInstruction?: string;
  userPrompt: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: z.ZodType<T, z.ZodTypeDef, any>;
  userId?: string;
  estimatedTokens?: number;
  maxRetries?: number;
  isPrivileged?: boolean;
}): Promise<{
  data: T;
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  fallbackTriggered: boolean;
}> {
  if (userId) {
    await checkRateLimitAndQuota(userId, estimatedTokens);
  }

  const result = await generateWithFallback<T>({
    task,
    userPrompt,
    systemInstruction,
    schema,
    userId,
    estimatedTokens,
    isPrivileged: isPrivileged !== undefined ? isPrivileged : (task === "class_build" || task === "structured_spec"),
  });

  if (!result.data) {
    throw new Error(`AI generation failed to produce structured data for task ${task}`);
  }

  return {
    data: result.data,
    modelUsed: result.modelUsed,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    latencyMs: result.latencyMs,
    fallbackTriggered: result.fallbackTriggered,
  };
}

/**
 * Executes a lightweight test ping to a single model.
 * Contained strictly within lib/ai/** to respect architectural isolation.
 */
export async function testSingleModel(
  model: string,
  prompt = "Respond with exactly the single word: OK"
): Promise<{ text: string; inTokens: number; outTokens: number; latencyMs: number }> {
  const startTime = Date.now();
  const client = getGeminiClient();
  const response = await client.models.generateContent({
    model,
    contents: prompt,
  });
  const latencyMs = Date.now() - startTime;
  const rawText = response.text;
  const text = typeof rawText === "string" ? rawText : "";
  const usage = response.usageMetadata;
  const inTokens = usage?.promptTokenCount || 5;
  const outTokens = usage?.candidatesTokenCount || 2;

  await recordModelUsage(model, inTokens, outTokens);
  await clearModelExhausted(model);

  return { text, inTokens, outTokens, latencyMs };
}
