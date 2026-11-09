import { z } from "zod";
import { generateStructured } from "@/lib/ai/structured/generate";
import type { AiConfig } from "@/lib/ai/structured/types";
import { tokens } from "./fuzzy";
import type { Gen } from "./extract";
import type { KnowledgeUnit, SourceAnchor } from "./types";

export const TUTOR_MODES = ["simple", "exam", "quiz", "compare", "mnemonic"] as const;
export type TutorMode = (typeof TUTOR_MODES)[number];

const answerSchema = z.object({ answer: z.string().min(1).max(1200), citations: z.array(z.string()).max(12), inNotes: z.boolean(), aiAdded: z.string().max(800).nullish() });

export interface TutorAnswer {
  answer: string;
  inNotes: boolean;
  /** the facts she can open in her notes */
  cited: Array<{ id: string; statement: string; source: SourceAnchor }>;
  /** general knowledge the model added: shown dimmed and labelled, never as her notes (R1) */
  aiAdded: string | null;
}

/** The facts most related to a question: shared words, rarer words counting more. */
export function retrieve(question: string, units: KnowledgeUnit[], max = 8): KnowledgeUnit[] {
  const q = new Set(tokens(question).filter((t) => t.length > 2));
  const df = new Map<string, number>();
  for (const u of units) for (const t of new Set(tokens(u.statement))) df.set(t, (df.get(t) ?? 0) + 1);
  return units
    .filter((u) => u.status === "active")
    .map((u) => {
      let score = 0;
      for (const t of new Set([...tokens(u.statement), ...tokens(u.answer)])) if (q.has(t)) score += 1 + Math.log(1 + units.length / (df.get(t) ?? 1));
      return { u, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.u);
}

export async function askTutor(question: string, mode: TutorMode, units: KnowledgeUnit[], opts: { config?: AiConfig; gen?: Gen } = {}): Promise<TutorAnswer> {
  const gen = opts.gen ?? generateStructured;
  const facts = retrieve(question, units);
  // nothing in her notes is related: say so without spending a model call, and do not pretend
  if (facts.length === 0 && mode !== "mnemonic") return { answer: "I couldn't find that in your notes.", inNotes: false, cited: [], aiAdded: null };
  const r = await gen({
    task: "tutor_chat",
    promptName: "tutor_grounded",
    promptVars: { mode, facts: facts.map((f) => `${f.id}: ${f.statement}`).join("\n") || "(none)", question: question.slice(0, 600) },
    schema: answerSchema,
    config: opts.config,
    temperature: 0.3,
    maxTokens: 900,
  });
  const byId = new Map(facts.map((f) => [f.id, f]));
  // a citation the model made up is dropped; "in my notes" with nothing to point at is not believed
  const cited = Array.from(new Set(r.data.citations)).filter((id) => byId.has(id)).map((id) => ({ id, statement: byId.get(id)!.statement, source: byId.get(id)!.source }));
  const inNotes = r.data.inNotes && cited.length > 0;
  return { answer: inNotes || !r.data.inNotes ? r.data.answer : "I couldn't tie that to your notes, so treat it with care.", inNotes, cited, aiAdded: r.data.aiAdded?.trim() ? r.data.aiAdded.trim() : null };
}
