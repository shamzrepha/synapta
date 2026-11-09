import { generateStructured, batchPlan } from "@/lib/ai/structured/generate";
import type { AiConfig, Tier } from "@/lib/ai/structured/types";
import { fuzzyContains, jaccard, normalize, wordCount } from "./fuzzy";
import { ontologyText, type SubjectPack } from "./packs";
import { rawUnitsSchema, stableId, type KnowledgeUnit, type RawUnit } from "./types";
import type { CleanLine } from "./clean";
import type { Section } from "./outline";

export type Gen = typeof generateStructured;

export interface ExtractContext {
  docId: string;
  pageNo: number;
  pack: SubjectPack;
  tier: Tier;
  config: AiConfig;
  templateHint: "condition" | "procedure" | "none";
  gen?: Gen;
}

export interface ExtractReport {
  units: KnowledgeUnit[];
  dropped: Array<{ statement: string; reason: string }>;
  coverage: number;
  modelCalls: number;
}

const tokensOf = (s: string) => Math.ceil(s.split(/\s+/).length * 1.35);

/** Splits a section into chunks that fit the model's tier (spec 4.4). */
export function chunkLines(lines: CleanLine[], maxTokens: number): CleanLine[][] {
  const out: CleanLine[][] = [];
  let cur: CleanLine[] = [];
  let used = 0;
  for (const l of lines) {
    const t = tokensOf(l.text);
    if (cur.length && used + t > maxTokens) {
      out.push(cur);
      cur = [];
      used = 0;
    }
    cur.push(l);
    used += t;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** The deterministic checks every unit must pass before it is kept (spec S3). Returns null when fine, else the reason. */
export function checkUnit(u: RawUnit, lines: CleanLine[]): string | null {
  if (wordCount(u.statement) > 25) return "statement is longer than 25 words";
  if (wordCount(u.answer) > 12) return "answer is longer than 12 words";
  const from = Math.min(u.source.lineStart, u.source.lineEnd);
  const to = Math.max(u.source.lineStart, u.source.lineEnd);
  const cited = lines.filter((l) => l.lineNo >= from && l.lineNo <= to);
  if (cited.length === 0) return "cites lines that do not exist";
  if (!fuzzyContains(cited.map((l) => l.text).join(" "), u.source.excerpt, 0.9)) return "excerpt is not in the cited lines";
  return null;
}

function toKu(u: RawUnit, ctx: ExtractContext, lines: CleanLine[], conceptId: string): KnowledgeUnit {
  const cited = lines.filter((l) => l.lineNo >= u.source.lineStart && l.lineNo <= u.source.lineEnd);
  const lineConf = cited.length ? Math.min(...cited.map((l) => l.confidence)) : 1;
  return {
    id: stableId("ku", normalize(u.statement)),
    conceptId,
    type: u.type,
    statement: u.statement.trim(),
    question: u.question.trim(),
    answer: u.answer.trim(),
    ...(u.extra ? { extra: u.extra } : {}),
    ...(u.order ? { order: u.order } : {}),
    ...(u.critical ? { critical: true } : {}),
    source: { docId: ctx.docId, pageNo: u.source.pageNo || ctx.pageNo, lineStart: u.source.lineStart, lineEnd: u.source.lineEnd, excerpt: u.source.excerpt.trim() },
    alsoIn: [],
    provenance: "notes",
    // a unit is only as trustworthy as the least legible line it came from
    confidence: Math.min(u.confidence ?? 0.9, lineConf),
    status: "active",
    tags: [],
  };
}

export function dedupeUnits(units: KnowledgeUnit[]): KnowledgeUnit[] {
  const out: KnowledgeUnit[] = [];
  for (const u of units) {
    const same = out.find((x) => x.id === u.id || jaccard(x.statement, u.statement) >= 0.85);
    if (same) same.alsoIn.push(u.source);
    else out.push(u);
  }
  return out;
}

/** Share of non-heading lines that some unit cites (spec S3 coverage check). */
export function coverageOf(lines: CleanLine[], units: KnowledgeUnit[]): { ratio: number; uncovered: CleanLine[] } {
  const body = lines.filter((l) => !/^#|^[A-Z][A-Z\s&/-]{3,}$/.test(l.text) && l.text.length > 12);
  const uncovered = body.filter((l) => !units.some((u) => l.lineNo >= u.source.lineStart && l.lineNo <= u.source.lineEnd));
  return { ratio: body.length ? 1 - uncovered.length / body.length : 1, uncovered };
}

async function askModel(ctx: ExtractContext, section: Section, path: string, chunk: CleanLine[], retryNote: string) {
  const gen = ctx.gen ?? generateStructured;
  const source = chunk.map((l) => `${ctx.pageNo}:${l.lineNo} ${l.text}`).join("\n");
  const r = await gen({
    task: "extract",
    promptName: "extract_ku",
    promptVars: {
      subject_pack: ctx.pack.name,
      ontology: ontologyText(ctx.pack),
      pitfalls: ctx.pack.pitfalls.join(" "),
      section_path: path,
      template_hint: ctx.templateHint,
      source,
      retry_note: retryNote,
    },
    schema: rawUnitsSchema,
    config: ctx.config,
    temperature: 0.1,
    maxTokens: 3000,
  });
  void section;
  return r.data.units;
}

/**
 * Extracts Knowledge Units from one section (spec S3). Each unit is checked against the source; failures are re-asked
 * once with the exact reason, then dropped and counted. A missed-facts pass runs when too many lines are uncited.
 */
export async function extractSection(section: Section, lines: CleanLine[], ctx: ExtractContext): Promise<ExtractReport> {
  const body = lines.filter((l) => l.lineNo >= section.lineStart && l.lineNo <= section.lineEnd);
  const conceptId = stableId("concept", normalize(section.title));
  const plan = batchPlan(ctx.tier, ctx.config);
  const kept: KnowledgeUnit[] = [];
  const dropped: ExtractReport["dropped"] = [];
  let calls = 0;

  const run = async (chunk: CleanLine[], note: string) => {
    calls++;
    const raw = await askModel(ctx, section, section.title, chunk, note);
    const failed: Array<{ u: RawUnit; why: string }> = [];
    for (const u of raw) {
      const why = checkUnit(u, lines);
      if (why) failed.push({ u, why });
      else kept.push(toKu(u, ctx, lines, conceptId));
    }
    return failed;
  };

  for (const chunk of chunkLines(body, plan.maxChunkTokens)) {
    let failed = await run(chunk, "");
    if (failed.length) {
      const note = `RETRY. These units failed the checks, so write them again correctly or leave them out:\n${failed.map((f) => `- "${f.u.statement.slice(0, 80)}": ${f.why}`).join("\n")}`;
      failed = await run(chunk, note);
      for (const f of failed) dropped.push({ statement: f.u.statement, reason: f.why });
    }
  }

  let units = dedupeUnits(kept);
  const cov = coverageOf(body, units);
  if (cov.ratio < 0.85 && cov.uncovered.length) {
    const failed = await run(cov.uncovered, "MISSED FACTS PASS: these lines were not covered yet. Extract the facts from them.");
    for (const f of failed) dropped.push({ statement: f.u.statement, reason: f.why });
    units = dedupeUnits(kept);
  }
  return { units, dropped, coverage: coverageOf(body, units).ratio, modelCalls: calls };
}
