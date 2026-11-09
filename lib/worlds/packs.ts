import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { tokens } from "./fuzzy";

/** A Subject Pack is data, not code: adding a subject means adding a file here (spec 13). Never executed. */
export const packSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  keywords: z.array(z.string()),
  concepts: z.array(z.object({ kind: z.string(), template: z.array(z.string()) })),
  ontology: z.array(z.object({ type: z.string(), hint: z.string(), extra: z.array(z.string()).optional() })),
  themes: z.array(z.string()),
  distractorHints: z.array(z.string()).default([]),
  pitfalls: z.array(z.string()).default([]),
  disclaimer: z.string().optional(),
});
export type SubjectPack = z.infer<typeof packSchema>;

const DIR = () => path.join(process.cwd(), "subject-packs");
let cache: SubjectPack[] | null = null;

export function loadPacks(dir = DIR()): SubjectPack[] {
  if (cache && dir === DIR()) return cache;
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const packs: SubjectPack[] = [];
  for (const f of files) {
    const parsed = packSchema.safeParse(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
    if (parsed.success) packs.push(parsed.data);
  }
  if (dir === DIR()) cache = packs;
  return packs;
}

export const getPack = (id: string): SubjectPack => loadPacks().find((p) => p.id === id) ?? loadPacks().find((p) => p.id === "general")!;

/** Rule-based subject detection (spec S2). Below 0.6 confidence the general pack is used and the student can change it in one tap. */
export function detectSubject(text: string, packs: SubjectPack[] = loadPacks()): { packId: string; secondary: string[]; confidence: number } {
  const bag = new Map<string, number>();
  for (const t of tokens(text)) bag.set(t, (bag.get(t) ?? 0) + 1);
  const total = Math.max(1, [...bag.values()].reduce((a, b) => a + b, 0));
  const scored = packs
    .filter((p) => p.keywords.length)
    .map((p) => {
      const hits = p.keywords.reduce((n, k) => n + (bag.get(k.toLowerCase()) ?? 0), 0);
      const distinct = p.keywords.filter((k) => bag.has(k.toLowerCase())).length;
      // distinct keywords matter more than repeats; a few strong hits are enough in a short note
      const confidence = Math.min(1, distinct / Math.max(4, p.keywords.length * 0.3) + (hits / total) * 2);
      return { id: p.id, confidence };
    })
    .sort((a, b) => b.confidence - a.confidence);
  const best = scored[0];
  if (!best || best.confidence < 0.6) return { packId: "general", secondary: [], confidence: best?.confidence ?? 0 };
  return { packId: best.id, secondary: scored.slice(1).filter((s) => s.confidence >= 0.6).map((s) => s.id), confidence: best.confidence };
}

export function ontologyText(pack: SubjectPack): string {
  return pack.ontology.map((o) => `- ${o.type}: ${o.hint}${o.extra ? ` (extra: ${o.extra.join(", ")})` : ""}`).join("\n");
}
