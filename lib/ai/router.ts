import { getServerEnv, DEFAULT_GEMINI_MODEL } from "@/lib/env";
import { getGeminiClient } from "@/lib/gemini/client";
import { checkRateLimitAndQuota, recordTokenUsage } from "@/lib/quota/guard";
import { z } from "zod";
import {
  DEFAULT_MODEL_CONFIG,
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

export { sanitizeModelId, DEFAULT_GEMINI_MODEL };

export type AiTask =
  | "tutor_chat"          // realtime Socratic chat, hints -> light
  | "structured_spec"     // JSON: syllabus/KC map, quiz, SimSpec -> light
  | "grading_high_stakes" // boss quests, transfer tests, teach-the-bot grading -> heavy
  | "long_document"       // textbook/PDF analysis & topic extraction -> light
  | "class_build"         // Initial map draft & map reconciliation -> heavy
  | "voice";              // live audio -> heavy

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
  if (cachedDynamicModels && cachedDynamicModels[task]) {
    return cachedDynamicModels[task];
  }

  try {
    const env = getServerEnv();
    switch (task) {
      case "tutor_chat":
        return env.GEMINI_MODEL_TUTOR;
      case "structured_spec":
        return env.GEMINI_MODEL_STRUCTURED;
      case "long_document":
        return env.GEMINI_MODEL_LONGDOC;
      case "class_build":
        return env.GEMINI_MODEL_BUILD;
      case "grading_high_stakes":
        return env.GEMINI_MODEL_GRADING;
      case "voice":
        return env.GEMINI_MODEL_VOICE;
      default:
        return env.GEMINI_MODEL_FALLBACK;
    }
  } catch {
    switch (task) {
      case "tutor_chat":
        return process.env.GEMINI_MODEL_TUTOR || DEFAULT_MODEL_CONFIG.tutor;
      case "structured_spec":
        return process.env.GEMINI_MODEL_STRUCTURED || DEFAULT_MODEL_CONFIG.structured;
      case "long_document":
        return process.env.GEMINI_MODEL_LONGDOC || DEFAULT_MODEL_CONFIG.longdoc;
      case "class_build":
        return process.env.GEMINI_MODEL_BUILD || DEFAULT_MODEL_CONFIG.build;
      case "grading_high_stakes":
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

  if (customFallbackChain.length > 0) {
    return Array.from(new Set([primary, ...customFallbackChain]));
  }

  if (task === "tutor_chat" || task === "structured_spec" || task === "long_document") {
    // Light tasks stay strictly within light models
    return Array.from(new Set([primary, ...lightChain]));
  }

  // Heavy tasks walk heavy chain first, and as last resort drop to light chain
  return Array.from(new Set([primary, ...heavyChain, ...lightChain]));
}

export interface ClassifiedError {
  type: "daily_exhaustion" | "rate_limit_minute" | "invalid_model" | "transient" | "unrecoverable";
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
}

/**
 * Universal quota-aware AI execution pipeline with multi-tier fallback,
 * RPM pacing, budget guard, cache lookups, and PII-safe error masking.
 */
export async function generateWithFallback<T>({
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
}: GenerateWithFallbackOptions<T>): Promise<GenerateWithFallbackResult<T>> {
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

  const ai = getGeminiClient();
  // Always load admin-assigned models BEFORE resolving the chain (serverless cold starts
  // otherwise ignore admin configuration and fall back to env/default models).
  await getDynamicModelConfig();
  const chain = getChainForTask(task);
  const primaryModel = chain[0];

  let fallbackTriggered = false;
  let lastError: unknown = null;
  let attemptedAny = false;

  for (let i = 0; i < chain.length; i++) {
    const activeModel = chain[i];

    // Privileged (teacher class-building) calls never pre-emptively skip a model based on
    // local counters or cached cooldowns; only a real provider error moves us along the chain.
    if (!isPrivileged) {
      const available = await isModelAvailable(activeModel);
      if (!available) {
        fallbackTriggered = true;
        continue;
      }

      const withinReserve = await isWithinModelReserve(activeModel, false);
      if (!withinReserve) {
        console.warn(`[lib/ai/router] Model "${activeModel}" is at or above 90% reserve. Skipping to next candidate.`);
        fallbackTriggered = true;
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
            rawJson = JSON.parse(responseText);
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
        if (userId) {
          await recordTokenUsage(userId, tokensIn, tokensOut).catch(() => {});
        }

        // Cache result if key provided
        if (cacheKey) {
          adminDb().collection("aiCache").doc(cacheKey).set({
            text: responseText,
            data: parsedData || null,
            modelUsed: activeModel,
            createdAt: new Date().toISOString(),
          }).catch(() => {});
        }

        const reducedQuality = activeModel.includes("lite") && (task === "class_build" || task === "grading_high_stakes");

        return {
          text: responseText,
          data: parsedData,
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

        if (classified.type === "daily_exhaustion") {
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
          const waitSec = Math.min(20, classified.retryDelaySeconds || 5);
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
          rawJson = JSON.parse(responseText);
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
      if (classified.type === "daily_exhaustion") {
        await markModelExhausted(probeModel, classified.retryDelaySeconds);
      }
    }
  }

  // If we reach here, all candidate models in the chain were exhausted
  if (lastError) {
    console.warn(`[lib/ai/router] All models exhausted in chain. Last error:`, lastError instanceof Error ? lastError.message : String(lastError));
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
