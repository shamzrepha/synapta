import { z } from "zod";
import { generateWithFallback } from "@/lib/ai/router";
import { TEMPLATES } from "./templates";

/**
 * Goal → build path (from the maker survey: "type a goal and get a step-by-step path of what to
 * learn and what to do next"). Ordered, matched to the learner's level, one concept per stage,
 * a build checklist after each lesson, a video search per stage and a costed parts list.
 */
export const pathStageSchema = z.object({
  id: z.string().max(40),
  title: z.string().max(120),
  why: z.string().max(600),
  learn: z.array(z.string().max(120)).max(6).default([]),
  videoQuery: z.string().max(120),
  checklist: z.array(z.string().max(200)).min(1).max(8),
  /** a pre-saved Maker Studio project that practises this stage, if one fits */
  templateId: z.string().max(60).nullable().default(null),
  /** otherwise: what to ask the AI to design for this stage */
  buildPrompt: z.string().max(400).nullable().default(null),
});

export const pathSchema = z.object({
  title: z.string().max(120),
  summary: z.string().max(800),
  stages: z.array(pathStageSchema).min(3).max(12),
  parts: z
    .array(z.object({ name: z.string().max(80), qty: z.number().int().min(1).max(100).default(1), estCost: z.string().max(40).default(""), substitute: z.string().max(160).default("") }))
    .max(30)
    .default([]),
  safety: z.string().max(600).default(""),
});
export type LearningPath = z.output<typeof pathSchema>;

export async function generatePath(params: { goal: string; level: number; interests: string[]; preference: string; userId: string }): Promise<LearningPath> {
  const templates = TEMPLATES.map((t) => `${t.id}: ${t.title} (${t.kind}, ${t.level})`).join("; ");
  const res = await generateWithFallback({
    task: "studio_build",
    systemInstruction: `You are Sunroot's maker mentor. Turn a learner's build goal into an ordered learning-and-building path.
Rules:
- Order stages so nothing assumes knowledge not yet taught (most learners quit because tutorials assume knowledge they don't have).
- Match the learner's level (1 = complete beginner, 5 = advanced): skip what they know, fill gaps.
- Each stage teaches ONE idea, says why it matters for the goal, lists concepts, a precise YouTube search (videoQuery), and a short build checklist the learner can tick.
- For each stage, set templateId to one of these simulator projects if it practises the idea, else null and give a buildPrompt the simulator's AI can build (circuits with code, gear/lifting mechanisms, or 3D assemblies): ${templates}.
- Parts list: real, cheap components with estimated costs in Nigerian Naira (₦) and a cheaper substitute. Everything can be simulated first in Maker Studio, so learners don't need to buy parts to start.
- Include short safety notes.
Return ONLY JSON: {"title","summary","stages":[{"id","title","why","learn":[],"videoQuery","checklist":[],"templateId","buildPrompt"}],"parts":[{"name","qty","estCost","substitute"}],"safety"}`,
    userPrompt: `Goal: ${params.goal.slice(0, 500)}
Level: ${params.level}/5. Interests: ${params.interests.join(", ") || "not given"}. Prefers: ${params.preference || "no preference"}.
Make 5–9 stages.`,
    schema: pathSchema,
    temperature: 0.4,
    userId: params.userId,
  });
  const path = res.data!;
  const ids = new Set(TEMPLATES.map((t) => t.id));
  return {
    ...path,
    stages: path.stages.map((s, i) => ({ ...s, id: `st${i + 1}`, templateId: s.templateId && ids.has(s.templateId) ? s.templateId : null })),
  };
}
