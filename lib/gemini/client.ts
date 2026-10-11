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

export function getGeminiModel(): string {
  const env = getServerEnv();
  return env.GEMINI_MODEL || "gemini-2.5-flash";
}

interface GenerateStructuredOptions<T> {
  systemInstruction?: string;
  userPrompt: string;
  schema: z.ZodType<T>;
  maxRetries?: number;
}

/**
 * Invokes Gemini with JSON output mode, validating the output against the specified Zod schema.
 * Employs exponential backoff with jitter on rate limits (429) or transient server errors (503).
 * Throws clean, actionable errors if the API is unavailable or unconfigured.
 */
export async function generateStructuredJson<T>({
  systemInstruction,
  userPrompt,
  schema,
  maxRetries = 3,
}: GenerateStructuredOptions<T>): Promise<{ data: T; tokensIn: number; tokensOut: number }> {
  const env = getServerEnv();
  const apiKey = env.GEMINI_API_KEY;

  if (!apiKey || apiKey.startsWith("mock-") || apiKey === "demo") {
    throw new Error(
      "GEMINI_API_KEY is invalid or set to a placeholder. A genuine Google Gemini API key is required to synthesize syllabi, quizzes, and learning materials."
    );
  }

  const modelName = getGeminiModel();
  const ai = getGeminiClient();

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= maxRetries) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: userPrompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
        },
      });

      const responseText = response.text || "";
      const tokensIn = response.usageMetadata?.promptTokenCount || 500;
      const tokensOut = response.usageMetadata?.candidatesTokenCount || 800;

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(responseText);
      } catch (parseErr) {
        throw new Error(`Failed to parse AI output as JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
      }

      const validated = schema.safeParse(parsedJson);

      if (!validated.success) {
        console.warn("Gemini output schema validation failed on attempt", attempt, validated.error.format());
        if (attempt === maxRetries) {
          throw new Error(`AI generated JSON did not match expected schema: ${validated.error.message}`);
        }
        attempt++;
        const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }

      return {
        data: validated.data,
        tokensIn,
        tokensOut,
      };
    } catch (err: unknown) {
      lastError = err;
      attempt++;
      if (attempt > maxRetries) break;

      const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      console.warn(`Gemini API call failed (attempt ${attempt}/${maxRetries}). Retrying in ${Math.round(backoffMs)}ms...`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Gemini AI service unavailable after ${maxRetries} attempts: ${errorMessage}`);
}
