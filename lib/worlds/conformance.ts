import fs from "node:fs";
import path from "node:path";
import { generateStructured } from "@/lib/ai/structured/generate";
import type { AiConfig } from "@/lib/ai/structured/types";
import { cleanLines, textToRawLines } from "./clean";
import { extractSection, type Gen } from "./extract";
import { buildOutline, templateHint } from "./outline";
import { getPack } from "./packs";

export interface ConformanceReport {
  stage: "extract";
  fixture: string;
  sections: number;
  unitsKept: number;
  unitsDropped: number;
  /** share of the model's facts that passed the grounding checks (spec 19.4: target 95%) */
  groundingPct: number;
  /** how many of the known facts in the fixture it found */
  recallPct: number;
  repairs: number;
  failures: number;
  latencyMs: number;
  passed: boolean;
  notes: string[];
}

/** Facts every good run on the gastrostomy fixture must find (spec 19.1). */
const MUST_FIND = [/4.?6 hours/i, /24 hours/i, /pinch/i, /18 inches/i, /clean(?:ing)? the stoma|stoma site/i];

export const FIXTURE_FILE = () => path.join(process.cwd(), "fixtures", "worlds", "gastrostomy_sample.txt");

/**
 * Spec 19.4: runs a known note through the real gateway with the configured models and reports how well they did, so
 * "any model works" is measured instead of assumed. Thresholds: grounding at least 95%, recall at least 60%, no failed sections.
 */
export async function runExtractConformance(config: AiConfig, gen: Gen = generateStructured, text?: string): Promise<ConformanceReport> {
  const raw = text ?? fs.readFileSync(FIXTURE_FILE(), "utf8");
  const { lines } = cleanLines(textToRawLines(raw));
  const sections = buildOutline(lines);
  const hint = templateHint(sections);
  const { resolveChain } = await import("@/lib/ai/structured/config");
  const tier = (await resolveChain("extract", config))[0].tier;
  let repairs = 0;
  const counting = (async (o: Parameters<Gen>[0]) => {
    const r = await gen({ ...o, config });
    repairs += r.meta.repairs;
    return r;
  }) as unknown as Gen;
  const started = Date.now();
  let kept = 0;
  let dropped = 0;
  let failures = 0;
  const statements: string[] = [];
  for (const s of sections) {
    try {
      const r = await extractSection(s, lines, { docId: "conformance", pageNo: 1, pack: getPack("nursing_medical"), tier, config, templateHint: hint, gen: counting });
      kept += r.units.length;
      dropped += r.dropped.length;
      statements.push(...r.units.map((u) => `${u.statement} ${u.answer}`));
    } catch {
      failures++;
    }
  }
  const found = MUST_FIND.filter((re) => statements.some((s) => re.test(s))).length;
  const groundingPct = kept + dropped ? Math.round((kept / (kept + dropped)) * 100) : 0;
  const recallPct = Math.round((found / MUST_FIND.length) * 100);
  const notes: string[] = [];
  if (groundingPct < 95) notes.push("Too many facts were not found in the notes. Try a stronger model for this job.");
  if (recallPct < 60) notes.push("It missed key facts. Try a stronger model or a model with a longer memory.");
  if (failures) notes.push(`${failures} section(s) failed outright.`);
  if (repairs > sections.length) notes.push("It often needed its JSON fixed. A model with JSON mode works better.");
  return { stage: "extract", fixture: "gastrostomy sample", sections: sections.length, unitsKept: kept, unitsDropped: dropped, groundingPct, recallPct, repairs, failures, latencyMs: Date.now() - started, passed: groundingPct >= 95 && recallPct >= 60 && failures === 0, notes };
}
