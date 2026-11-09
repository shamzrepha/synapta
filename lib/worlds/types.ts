import { z } from "zod";

export const KU_TYPES = ["definition", "cause", "risk_factor", "sign_symptom", "mechanism_step", "drug", "procedure_step", "indication", "contraindication", "complication", "prevention", "nursing_action", "rationale", "diagnostic", "classification", "formula", "date_event", "rule", "case_holding", "vocab", "example", "misc"] as const;
export type KUType = (typeof KU_TYPES)[number];

export const anchorSchema = z.object({
  docId: z.string(),
  pageNo: z.number().int().min(1),
  lineStart: z.number().int().min(1),
  lineEnd: z.number().int().min(1),
  excerpt: z.string().min(1).max(600),
});
export type SourceAnchor = z.infer<typeof anchorSchema>;

/** What a model returns for one unit (spec 6.3); the app adds ids, concept and the document id. */
export const rawUnitSchema = z.object({
  type: z.enum(KU_TYPES),
  statement: z.string().min(3),
  question: z.string().min(3),
  answer: z.string().min(1),
  extra: z.record(z.string(), z.string()).nullish(),
  order: z.number().int().min(1).max(50).nullish(),
  critical: z.boolean().optional(),
  source: z.object({ pageNo: z.number().int().min(1), lineStart: z.number().int().min(1), lineEnd: z.number().int().min(1), excerpt: z.string().min(1) }),
  provenance: z.enum(["notes", "ai_added"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type RawUnit = z.infer<typeof rawUnitSchema>;
export const rawUnitsSchema = z.object({ units: z.array(rawUnitSchema).max(60) });

export interface KnowledgeUnit {
  id: string;
  conceptId: string;
  type: KUType;
  statement: string;
  question: string;
  answer: string;
  extra?: Record<string, string>;
  order?: number;
  critical?: boolean;
  source: SourceAnchor;
  /** other notes that say the same thing: the more notes agree, the stronger the fact */
  alsoIn: SourceAnchor[];
  provenance: "notes" | "ai_added";
  confidence: number;
  status: "active" | "superseded";
  tags: string[];
}

export interface Concept {
  id: string;
  name: string;
  kind: "condition" | "procedure" | "process" | "drug_class" | "case" | "event" | "theme" | "topic";
  summary: string;
  kuIds: string[];
  docIds: string[];
  /** the heading above it in the notes: concepts with the same topic share a zone on the map */
  topic?: string;
}

export interface Relation {
  from: string;
  to: string;
  type: "causes" | "leads_to" | "part_of" | "treated_by" | "contrasts_with" | "prerequisite_of" | "example_of" | "related_to";
}

export interface Conflict {
  id: string;
  kuIdA: string;
  kuIdB: string;
  why: string;
  status: "open" | "resolved" | "later";
  /** the KU the student chose as correct */
  chosenKuId?: string;
}

export interface Library {
  concepts: Record<string, Concept>;
  units: Record<string, KnowledgeUnit>;
  relations: Relation[];
  conflicts: Record<string, Conflict>;
  docIds: string[];
}

export const emptyLibrary = (): Library => ({ concepts: {}, units: {}, relations: [], conflicts: {}, docIds: [] });

/** Short stable id from text (FNV-1a), so the same fact from two notes gets the same id and reruns overwrite instead of duplicating (R16). */
export function stableId(prefix: string, text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${prefix}_${h.toString(36)}`;
}
