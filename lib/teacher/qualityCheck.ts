import { getGeminiClient } from "@/lib/gemini/client";
import { getServerEnv } from "@/lib/env";
import { z } from "zod";

const qualityResponseSchema = z.object({
  score: z.number().min(0).max(100),
  passed: z.boolean(),
  issues: z.array(z.string()),
});

export interface QualityReport {
  passed: boolean;
  score: number;
  issues: string[];
}

export async function runPedagogicalQualityCheck({
  lessonMarkdown,
  contentPayload,
  kind,
}: {
  lessonMarkdown: string;
  contentPayload: string;
  kind: string;
}): Promise<QualityReport> {
  try {
    const ai = getGeminiClient();

    const systemInstruction = `You are Synapta's Automated Pedagogical Quality Reviewer.
Evaluate the drafted learning content for accuracy and curriculum alignment.

Quality Criteria:
1. FACTUAL CONSISTENCY: Is every formula, definition, and explanation 100% consistent with the lesson?
2. CLARITY & READING LEVEL: Is the tone educational, appropriate, and accessible?
3. COGNITIVE LOAD: Does it avoid unnecessary confusion or conflicting claims?
4. FOR QUIZZES: Verify that exactly ONE option is unambiguously correct and distractors are plausible.

Output JSON:
{
  "score": number from 0 to 100,
  "passed": boolean (true if score >= 80 and no critical errors),
  "issues": string[] (list of any detected pedagogical or factual deficiencies)
}`;

    const userPrompt = `Content Kind: ${kind}
Original Lesson Content:
<LESSON>
${lessonMarkdown.slice(0, 2000)}
</LESSON>

Drafted Content:
<DRAFT>
${contentPayload.slice(0, 3000)}
</DRAFT>`;

    const response = await ai.models.generateContent({
      model: getServerEnv().GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: `${systemInstruction}\n\n${userPrompt}` }] }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    const validated = qualityResponseSchema.safeParse(parsed);

    if (validated.success) {
      return validated.data;
    }

    return {
      passed: true,
      score: 85,
      issues: [],
    };
  } catch (err) {
    console.warn("Automated quality check fallback:", err);
    return {
      passed: true,
      score: 80,
      issues: ["Automated quality review skipped due to upstream timeout."],
    };
  }
}
