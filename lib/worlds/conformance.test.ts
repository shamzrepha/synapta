import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import { cleanLines, textToRawLines } from "./clean";
import { runExtractConformance } from "./conformance";
import { EMPTY_AI_CONFIG, type AiConfig } from "@/lib/ai/structured/types";
import type { Gen } from "./extract";

vi.mock("@/lib/firebase/admin", () => ({ adminDb: () => ({}), Timestamp: { now: () => ({}) }, FieldValue: { delete: () => ({}) } }));
vi.mock("@/lib/ai/api-key", () => ({ activeGeminiKey: () => "", refreshGeminiKey: async () => undefined }));
vi.mock("@/lib/ai/groq", () => ({ activeGroqKey: () => "", refreshGroqKey: async () => undefined, listGroqModels: async () => null }));

const config: AiConfig = { ...EMPTY_AI_CONFIG, models: { m: { id: "any", provider: "p", capabilities: ["json_mode"], contextTokens: 8000, maxOutputTokens: 2000, tier: "standard" } }, routes: { ...EMPTY_AI_CONFIG.routes, extract: ["m"] } };
const text = fs.readFileSync("fixtures/worlds/gastrostomy_sample.txt", "utf8");
const lines = cleanLines(textToRawLines(text)).lines;

const lineGen = (invent: boolean): Gen => (async (o: { promptVars: { source: string } }) => {
  const units = o.promptVars.source.split("\n").flatMap((row) => {
    const m = /^(\d+):(\d+) (.+)$/.exec(row);
    if (!m || /^[A-Z\s]+$/.test(m[3])) return [];
    return [{ type: "rule", statement: m[3].replace(/\.$/, "") + ".", question: "What does it say?", answer: m[3].slice(0, 40), source: { pageNo: 1, lineStart: Number(m[2]), lineEnd: Number(m[2]), excerpt: m[3] } }];
  });
  if (invent) units.push({ type: "rule", statement: "Give omeprazole before feeds.", question: "q?", answer: "omeprazole", source: { pageNo: 1, lineStart: 1, lineEnd: 1, excerpt: "Give omeprazole before each feed" } });
  return { data: { units }, meta: { modelId: "x", repairs: 1, latencyMs: 1, usage: { in: 0, out: 0 } } };
}) as unknown as Gen;

describe("model conformance test", () => {
  it("a faithful model passes on the gastrostomy fixture", async () => {
    const r = await runExtractConformance(config, lineGen(false), text);
    expect(r.groundingPct).toBe(100);
    expect(r.recallPct).toBe(100);
    expect(r.passed).toBe(true);
    expect(lines.length).toBeGreaterThan(5);
  });
  it("a model that invents facts fails, with a plain-language reason", async () => {
    const r = await runExtractConformance(config, lineGen(true), text);
    expect(r.unitsDropped).toBeGreaterThan(0);
    expect(r.groundingPct).toBeLessThan(100);
  });
  it("a model that finds nothing fails on recall", async () => {
    const empty: Gen = (async () => ({ data: { units: [] }, meta: { modelId: "x", repairs: 0, latencyMs: 1, usage: { in: 0, out: 0 } } })) as unknown as Gen;
    const r = await runExtractConformance(config, empty, text);
    expect(r.passed).toBe(false);
    expect(r.notes.join(" ")).toMatch(/missed key facts|not found/i);
  });
});
