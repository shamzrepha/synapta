import { GoogleGenAI } from "@google/genai";
import { activeGeminiKey } from "@/lib/ai/api-key";
import { z } from "zod";

let genAIClient: GoogleGenAI | null = null;
let clientKey = "";

/** A Gemini client for the current key (the admin's key when one is set, else GEMINI_API_KEY). */
export function getGeminiClient(): GoogleGenAI {
  const key = activeGeminiKey();
  if (!key) {
    throw new Error("GEMINI_API_KEY is not configured. Add a key in Admin Console → AI key, or in the environment variables.");
  }
  if (!genAIClient || clientKey !== key) {
    genAIClient = new GoogleGenAI({ apiKey: key });
    clientKey = key;
  }
  return genAIClient;
}

import { generateWithFallback, type AiTask, getChainForTask } from "@/lib/ai/router";

export function getGeminiModel(task?: AiTask): string {
  return getChainForTask(task || "structured_spec")[0];
}

interface GenerateStructuredOptions<T> {
  task?: AiTask;
  systemInstruction?: string;
  userPrompt: string;
  schema: z.ZodType<T>;
  maxRetries?: number;
}

/**
 * Invokes Gemini with JSON output mode, validating the output against the specified Zod schema.
 * Delegates to the unified generateWithFallback pipeline for quota-aware cascading and error classification.
 */
export async function generateStructuredJson<T>({
  task = "structured_spec",
  systemInstruction,
  userPrompt,
  schema,
}: GenerateStructuredOptions<T>): Promise<{ data: T; tokensIn: number; tokensOut: number }> {
  const apiKey = activeGeminiKey();

  if (!apiKey || apiKey.startsWith("mock-") || apiKey === "demo") {
    throw new Error(
      "GEMINI_API_KEY is invalid or set to a placeholder. A genuine Google Gemini API key is required to synthesize syllabi, quizzes, and learning materials."
    );
  }

  const result = await generateWithFallback<T>({
    task,
    userPrompt,
    systemInstruction,
    schema,
  });

  if (!result.data) {
    throw new Error(`AI generated response could not be validated against schema for task ${task}`);
  }

  return {
    data: result.data,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  };
}
