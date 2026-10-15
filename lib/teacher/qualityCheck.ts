import { executeStructuredAiTask } from "@/lib/ai/router";
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
    const systemInstruction = `You are Sunroot's Automated Pedagogical Quality Reviewer.
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

    const res = await executeStructuredAiTask({
      task: "structured_spec",
      systemInstruction,
      userPrompt,
      schema: qualityResponseSchema,
    });

    return res.data;
  } catch (err) {
    console.warn("Automated quality check fallback (failing closed):", err);
    return {
      passed: false,
      score: 0,
      issues: ["Automated quality review failed upstream. Manual teacher review required before approval."],
    };
  }
}
