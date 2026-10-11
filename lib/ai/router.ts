import { getServerEnv, sanitizeModelId, DEFAULT_GEMINI_MODEL } from "@/lib/env";
import { getGeminiClient } from "@/lib/gemini/client";
import { checkRateLimitAndQuota, recordTokenUsage } from "@/lib/quota/guard";
import { z } from "zod";

export { sanitizeModelId, DEFAULT_GEMINI_MODEL };

export type AiTask =
  | "tutor_chat"          // realtime Socratic chat, hints
  | "structured_spec"     // JSON: syllabus/KC map, quiz, SimSpec, routing decisions
  | "grading_high_stakes" // boss quests, transfer tests, teach-the-bot grading
  | "long_document"       // textbook/PDF analysis & topic extraction
  | "voice";              // live audio

/**
 * Returns the configured Gemini model identifier for a given task.
 * Model identifiers are loaded from validated server environment variables and sanitized.
 */
export function modelFor(task: AiTask): string {
  try {
    const env = getServerEnv();
    switch (task) {
      case "tutor_chat":
        return sanitizeModelId(env.GEMINI_MODEL_TUTOR);
      case "structured_spec":
        return sanitizeModelId(env.GEMINI_MODEL_STRUCTURED);
      case "grading_high_stakes":
        return sanitizeModelId(env.GEMINI_MODEL_GRADING);
      case "long_document":
        return sanitizeModelId(env.GEMINI_MODEL_LONGDOC);
      case "voice":
        return sanitizeModelId(env.GEMINI_MODEL_VOICE);
      default:
        return sanitizeModelId(env.GEMINI_MODEL_FALLBACK);
    }
  } catch {
    switch (task) {
      case "tutor_chat":
        return sanitizeModelId(process.env.GEMINI_MODEL_TUTOR || "gemini-3.5-flash-lite");
      case "structured_spec":
        return sanitizeModelId(process.env.GEMINI_MODEL_STRUCTURED || DEFAULT_GEMINI_MODEL);
      case "grading_high_stakes":
        return sanitizeModelId(process.env.GEMINI_MODEL_GRADING || DEFAULT_GEMINI_MODEL);
      case "long_document":
        return sanitizeModelId(process.env.GEMINI_MODEL_LONGDOC || DEFAULT_GEMINI_MODEL);
      case "voice":
        return sanitizeModelId(process.env.GEMINI_MODEL_VOICE || "gemini-3.8-live");
      default:
        return sanitizeModelId(process.env.GEMINI_MODEL_FALLBACK || DEFAULT_GEMINI_MODEL);
    }
  }
}

export function fallbackModel(): string {
  try {
    const env = getServerEnv();
    return sanitizeModelId(env.GEMINI_MODEL_FALLBACK);
  } catch {
    return sanitizeModelId(process.env.GEMINI_MODEL_FALLBACK || DEFAULT_GEMINI_MODEL);
  }
}

export interface ExecuteStructuredAiTaskOptions<T> {
  task: AiTask;
  systemInstruction?: string;
  userPrompt: string;
  schema: z.ZodType<T>;
  userId?: string;
  estimatedTokens?: number;
  maxRetries?: number;
}

export interface ExecuteStructuredAiTaskResult<T> {
  data: T;
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  fallbackTriggered: boolean;
}

function isModelRotOrRecoverableError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("not found") ||
    msg.includes("404") ||
    msg.includes("deprecated") ||
    msg.includes("not supported") ||
    msg.includes("resource_exhausted") ||
    msg.includes("429") ||
    msg.includes("unavailable")
  );
}

/**
 * Executes an AI structured JSON task with automated quota guarding,
 * fallback model routing, exponential backoff, and PII-safe logging.
 */
export async function executeStructuredAiTask<T>({
  task,
  systemInstruction,
  userPrompt,
  schema,
  userId,
  estimatedTokens = 1000,
  maxRetries = 2,
}: ExecuteStructuredAiTaskOptions<T>): Promise<ExecuteStructuredAiTaskResult<T>> {
  if (userId) {
    await checkRateLimitAndQuota(userId, estimatedTokens);
  }

  const primaryModel = modelFor(task);
  const fallback = fallbackModel();
  const ai = getGeminiClient();

  let activeModel = primaryModel;
  let fallbackTriggered = false;
  let attempt = 0;
  let lastError: unknown = null;
  const startTime = Date.now();

  while (attempt <= maxRetries) {
    try {
      const response = await ai.models.generateContent({
        model: activeModel,
        contents: userPrompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
        },
      });

      const responseText = response.text || "";
      const tokensIn = response.usageMetadata?.promptTokenCount || 500;
      const tokensOut = response.usageMetadata?.candidatesTokenCount || 600;

      let parsed: unknown;
      try {
        parsed = JSON.parse(responseText);
      } catch (parseErr) {
        throw new Error(
          `Failed to parse JSON response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`
        );
      }

      const validated = schema.safeParse(parsed);
      if (!validated.success) {
        if (attempt === maxRetries) {
          throw new Error(`Schema validation failed: ${validated.error.message}`);
        }
        attempt++;
        await new Promise((r) => setTimeout(r, 600 * attempt));
        continue;
      }

      if (userId) {
        await recordTokenUsage(userId, tokensIn, tokensOut).catch(() => {});
      }

      return {
        data: validated.data,
        modelUsed: activeModel,
        tokensIn,
        tokensOut,
        latencyMs: Date.now() - startTime,
        fallbackTriggered,
      };
    } catch (err: unknown) {
      lastError = err;
      attempt++;

      // Check if primary model failed with recoverable or model-rot error
      if (!fallbackTriggered && activeModel !== fallback && isModelRotOrRecoverableError(err)) {
        console.warn(
          `[model_fallback] Primary model "${activeModel}" failed for task "${task}". Retrying with fallback model "${fallback}".`
        );
        activeModel = fallback;
        fallbackTriggered = true;
        continue;
      }

      if (attempt > maxRetries) break;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }

  const errorMsg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`AI generation failed for task ${task} using ${activeModel}: ${errorMsg}`);
}
