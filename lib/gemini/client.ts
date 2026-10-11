import { GoogleGenAI } from "@google/genai";
import { getServerEnv } from "@/lib/env";
import { z } from "zod";

let genAIClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!genAIClient) {
    const env = getServerEnv();
    if (!env.GEMINI_API_KEY) {
      throw new Error(
        "GEMINI_API_KEY is not configured. Please supply a valid Google Gemini API key in your environment variables."
      );
    }
    genAIClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
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
  const env = getServerEnv();
  const apiKey = env.GEMINI_API_KEY;

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
