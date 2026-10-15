import { z } from "zod";
import type { ReportNumbers } from "./compute";

export const NarrativeSchema = z.object({
  summary: z.string().min(1),
  suggestion: z.string().min(1),
});

export const REPORT_SYSTEM = `You write a short, warm weekly progress note for a student.
Rules:
- The JSON inside <DATA> holds the only facts you may use. Never invent, estimate or round numbers; if you mention a number, copy it exactly from the data. Prefer mentioning few numbers.
- Return JSON only: {"summary":"2 to 3 sentences, encouraging and specific","suggestion":"exactly one concrete suggestion for next week, one sentence"}.
- Be kind and honest. If activity was low, be gentle and focus on a small next step. No emojis, no markdown, no medical or personal advice.`;

export function reportPrompt(n: ReportNumbers): string {
  return `<DATA>\n${JSON.stringify(n)}\n</DATA>`;
}
