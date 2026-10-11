import { executeStructuredAiTask, generateWithFallback } from "@/lib/ai/router";
import { sanitizeUntrustedPromptText } from "@/lib/ai/scrub";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { StudioOutputType } from "@/lib/notebook/types";
import { z } from "zod";

export interface StudioGenerateOptions {
  notebookId: string;
  type: StudioOutputType;
  sourceTexts: string[];
  userId?: string;
  focusPrompt?: string;
}

const mindMapSchema = z.object({
  title: z.string(),
  rootTopic: z.string(),
  children: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      summary: z.string().optional(),
      citationRef: z.string().optional(),
      children: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          summary: z.string().optional(),
          citationRef: z.string().optional(),
        })
      ).optional().default([]),
    })
  ),
});

export type MindMapData = z.infer<typeof mindMapSchema>;

export async function generateStudioOutput({
  notebookId,
  type,
  sourceTexts,
  userId,
  focusPrompt,
}: StudioGenerateOptions): Promise<{
  id: string;
  type: StudioOutputType;
  title: string;
  content: string;
  status: "ready" | "failed";
}> {
  const combinedSource = sanitizeUntrustedPromptText(sourceTexts.join("\n\n---\n\n"), 80000);
  const outRef = adminDb()
    .collection("notebooks")
    .doc(notebookId)
    .collection("outputs")
    .doc();

  if (type === "mindmap") {
    const res = await executeStructuredAiTask<MindMapData>({
      task: "notebook_mindmap",
      systemInstruction: `You are a visual curriculum architect. Synthesize a clean, hierarchical mind map of the provided documents. Ensure logical topic->subtopic progression.`,
      userPrompt: `Sources:\n${combinedSource}\n\n${focusPrompt ? `Focus Instructions: ${focusPrompt}\n` : ""}Generate the structured concept hierarchy.`,
      schema: mindMapSchema,
      userId,
    });

    const outputDoc = {
      id: outRef.id,
      notebookId,
      type: "mindmap" as const,
      title: res.data.title || res.data.rootTopic || "Mind Map",
      content: JSON.stringify(res.data),
      status: "ready" as const,
      modelUsed: res.modelUsed,
      createdAt: Timestamp.now(),
    };
    await outRef.set(outputDoc);
    return outputDoc;
  }

  // Study Guide, Briefing, FAQ, Timeline, Glossary, Cheatsheet
  const promptMap: Record<string, { task: string; title: string; instruction: string }> = {
    study_guide: {
      task: "study_guide",
      title: "Master Study Guide",
      instruction: "Produce an exhaustive, highly structured study guide with definitions, key equations, worked examples, common pitfalls, and review questions citing source sections.",
    },
    briefing: {
      task: "study_guide",
      title: "Executive Briefing Doc",
      instruction: "Produce an executive briefing document summarizing the core arguments, empirical evidence, strategic implications, and key takeaways.",
    },
    faq: {
      task: "study_guide",
      title: "Frequently Asked Questions",
      instruction: "Synthesize the 12 most critical conceptual and practical questions answered by the text, followed by rigorous, citation-backed answers.",
    },
    timeline: {
      task: "study_guide",
      title: "Chronological & Conceptual Timeline",
      instruction: "Structure a sequential timeline of milestones, discoveries, phases, or logical steps outlined in the provided literature.",
    },
    glossary: {
      task: "study_guide",
      title: "Technical Glossary & Notation",
      instruction: "Compile an alphabetical reference glossary defining every specialized term, acronym, symbol, and unit found in the text.",
    },
    cheatsheet: {
      task: "study_guide",
      title: "One-Page Exam Cheat Sheet",
      instruction: "Condense the most critical high-yield formulas, core definitions, quick heuristics, and essential summary rules into a high-density reference sheet.",
    },
  };

  const selected = promptMap[type] || promptMap.study_guide;

  const res = await generateWithFallback({
    task: selected.task,
    systemInstruction: `You are an expert academic tutor and pedagogical synthesis engine. ${selected.instruction}`,
    userPrompt: `Sources:\n${combinedSource}\n\n${focusPrompt ? `User Focus: ${focusPrompt}\n` : ""}Generate the full Markdown output.`,
    userId,
  });

  const outputDoc = {
    id: outRef.id,
    notebookId,
    type,
    title: selected.title,
    content: res.text,
    status: "ready" as const,
    modelUsed: res.modelUsed,
    createdAt: Timestamp.now(),
  };

  await outRef.set(outputDoc);
  return outputDoc;
}
