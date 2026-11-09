import { generateStructured } from "@/lib/ai/structured/generate";
import type { AiConfig } from "@/lib/ai/structured/types";
import { z } from "zod";
import { jaccard, tokens } from "./fuzzy";
import { stableId, type Conflict, type KnowledgeUnit, type Library } from "./types";
import type { Gen } from "./extract";

const NUMBER_WORDS: Record<string, string> = { one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10", twice: "2", once: "1", thrice: "3" };

/** The numbers a statement mentions (digits and number words), so two different values for the same action can be spotted. */
export function numbersIn(s: string): string[] {
  const out = new Set<string>();
  for (const m of s.matchAll(/\d+(?:\.\d+)?/g)) out.add(m[0]);
  for (const t of tokens(s)) if (NUMBER_WORDS[t]) out.add(NUMBER_WORDS[t]);
  return [...out].sort();
}

const STOP = new Set(["the", "a", "an", "of", "to", "in", "is", "are", "and", "or", "for", "with", "daily", "times", "time", "per", "at", "on", "be", "it"]);
const content = (s: string) => tokens(s).filter((t) => !STOP.has(t) && !/^\d/.test(t) && !NUMBER_WORDS[t]);

/**
 * Spec S5: pairs of facts about the same thing with different numbers. Deterministic and cheap; a model may confirm them.
 * The app never picks a winner: the student does (R2).
 */
export function conflictCandidates(units: KnowledgeUnit[]): Array<{ a: KnowledgeUnit; b: KnowledgeUnit }> {
  const active = units.filter((u) => u.status === "active");
  const out: Array<{ a: KnowledgeUnit; b: KnowledgeUnit }> = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      if (a.type !== b.type) continue;
      const na = numbersIn(a.statement);
      const nb = numbersIn(b.statement);
      if (na.length === 0 || nb.length === 0 || na.join() === nb.join()) continue;
      const shared = content(a.statement).filter((t) => content(b.statement).includes(t));
      if (shared.length >= 2 && jaccard(a.statement, b.statement) < 0.9) out.push({ a, b });
    }
  }
  return out;
}

const verdictSchema = z.object({ contradicts: z.boolean(), why: z.string() });

export interface AuditReport {
  conflicts: Conflict[];
  lowConfidence: string[];
  gaps: string[];
}

export async function auditLibrary(lib: Library, opts: { config?: AiConfig; gen?: Gen; useModel?: boolean } = {}): Promise<AuditReport> {
  const gen = opts.gen ?? generateStructured;
  const units = Object.values(lib.units);
  const conflicts: Conflict[] = [];
  for (const { a, b } of conflictCandidates(units)) {
    const id = stableId("conflict", [a.id, b.id].sort().join("|"));
    if (lib.conflicts[id]) continue; // already seen: keep the student's answer
    let why = `Your notes give different numbers: "${a.statement}" and "${b.statement}".`;
    if (opts.useModel) {
      try {
        const r = await gen({ task: "audit", promptName: "conflict_check", promptVars: { a: a.statement, b: b.statement }, schema: verdictSchema, config: opts.config, temperature: 0.1, maxTokens: 300 });
        if (!r.data.contradicts) continue;
        why = r.data.why;
      } catch {
        // the model is unavailable: the number mismatch alone is enough to ask the student
      }
    }
    conflicts.push({ id, kuIdA: a.id, kuIdB: b.id, why, status: "open" });
  }
  const lowConfidence = units.filter((u) => u.status === "active" && u.confidence < 0.7).map((u) => u.id);
  return { conflicts, lowConfidence, gaps: [] };
}

/** Records the student's answer: the chosen fact stays, the other is marked superseded (never deleted). */
export function resolveConflict(lib: Library, conflictId: string, chosenKuId: string): Library {
  const next = structuredClone(lib);
  const c = next.conflicts[conflictId];
  if (!c || ![c.kuIdA, c.kuIdB].includes(chosenKuId)) return next;
  const other = chosenKuId === c.kuIdA ? c.kuIdB : c.kuIdA;
  c.status = "resolved";
  c.chosenKuId = chosenKuId;
  if (next.units[other]) next.units[other].status = "superseded";
  return next;
}
