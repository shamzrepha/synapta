import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { extractJsonText, parseJsonLoose, describeZodError } from "./json";
import { findPromptFile, parsePromptSections, renderPrompt, loadPrompt } from "./prompts";
import { generateStructured, batchPlan } from "./generate";
import { guessModel, suggestRoutes } from "./categories";
import { EMPTY_AI_CONFIG, ProviderError, AiChainExhaustedError, AiRouteMissingError, TASKS, type AiConfig, type ModelProfile, type ProviderAdapter } from "./types";

vi.mock("@/lib/firebase/admin", () => ({ adminDb: () => ({}), Timestamp: { now: () => ({}) }, FieldValue: { delete: () => ({}) } }));
vi.mock("@/lib/ai/api-key", () => ({ activeGeminiKey: () => "", refreshGeminiKey: async () => undefined }));

const profile = (id: string, provider: string, caps: ModelProfile["capabilities"] = ["json_mode"], tier: ModelProfile["tier"] = "standard"): ModelProfile => ({ id, provider, capabilities: caps, contextTokens: 8000, maxOutputTokens: 2000, tier });
const cfg = (chain: Record<string, ModelProfile>, extract: string[]): AiConfig => ({ ...EMPTY_AI_CONFIG, models: chain, routes: { ...EMPTY_AI_CONFIG.routes, extract } });
const schema = z.object({ word: z.string(), length: z.number() });
const ask = (config: AiConfig, adapters: Record<string, ProviderAdapter>, extra: object = {}) =>
  generateStructured({ task: "extract", promptName: "ping", promptVars: { word: "heart" }, schema, config, adapterFor: async (p) => adapters[p] ?? null, sleep: async () => undefined, ...extra });
const returns = (...texts: string[]): ProviderAdapter & { calls: number; prompts: string[] } => {
  const a = { calls: 0, prompts: [] as string[], async call(req: { user: string }) { a.prompts.push(req.user); return { text: texts[Math.min(a.calls++, texts.length - 1)], usage: { in: 10, out: 5 } }; } };
  return a;
};

describe("JSON extraction", () => {
  it("strips fences and chatter, and brace-matches instead of grabbing greedily", () => {
    expect(extractJsonText('Sure! ```json\n{"a":1}\n``` hope that helps {not json}')).toBe('{"a":1}');
    expect(extractJsonText('x {"a":"}{","b":[1,{"c":2}]} trailing')).toBe('{"a":"}{","b":[1,{"c":2}]}');
    expect(extractJsonText("no json here")).toBeNull();
    expect(parseJsonLoose('{"a":').ok).toBe(false);
  });
  it("lists zod problems with their paths", () => {
    const r = schema.safeParse({ word: 1 });
    expect(r.success).toBe(false);
    if (!r.success) expect(describeZodError(r.error)).toContain("word");
  });
});

describe("prompt files", () => {
  it("finds the newest version, splits sections and fills variables", () => {
    expect(findPromptFile("ping")).toMatch(/ping\.v1\.md$/);
    expect(findPromptFile("../etc/passwd")).toBeNull();
    const md = "# Purpose\nx\n# Instructions\nSay {{word}}.\n# Output schema (human summary)\n{}\n";
    expect(parsePromptSections(md).Instructions).toBe("Say {{word}}.");
    expect(renderPrompt(md, { word: "hi" })).toContain("Say hi.");
    expect(() => renderPrompt(md, {})).toThrow(/word/);
    expect(loadPrompt("ping", { word: "lung" })).toContain('"lung"');
  });
});

describe("generateStructured", () => {
  const models = { a: profile("model-a", "p1"), b: profile("model-b", "p2") };

  it("returns validated JSON and reports usage", async () => {
    const r = await ask(cfg(models, ["a"]), { p1: returns('{"word":"HEART","length":5}') });
    expect(r.data).toEqual({ word: "HEART", length: 5 });
    expect(r.meta).toMatchObject({ modelId: "model-a", repairs: 0 });
    expect(r.meta.usage.in).toBe(10);
  });

  it("works the same with two different providers", async () => {
    const good = '{"word":"HEART","length":5}';
    const one = await ask(cfg(models, ["a"]), { p1: returns(good) });
    const two = await ask(cfg(models, ["b"]), { p2: returns(`Here you go:\n\`\`\`json\n${good}\n\`\`\``) });
    expect(one.data).toEqual(two.data);
  });

  it("repairs broken output using the exact error paths", async () => {
    const bad = returns('{"word":"HEART","length":"5"}', '{"word":"HEART","length":5}');
    const r = await ask(cfg(models, ["a"]), { p1: bad });
    expect(r.meta.repairs).toBe(1);
    expect(bad.prompts[1]).toContain("length");
    expect(bad.prompts[1]).toContain("YOUR PREVIOUS ANSWER");
  });

  it("fails over when a model is dead and when it cannot be repaired", async () => {
    const dead: ProviderAdapter = { call: async () => { throw new ProviderError("down", 503, true); } };
    const stubborn = returns("not json at all");
    const good = returns('{"word":"HEART","length":5}');
    const attempts: string[] = [];
    const r = await ask(cfg({ ...models, c: profile("model-c", "p3") }, ["a", "b", "c"]), { p1: dead, p2: stubborn, p3: good }, { onAttempt: (i: { modelId: string; ok: boolean }) => attempts.push(`${i.modelId}:${i.ok}`) });
    expect(r.meta.modelId).toBe("model-c");
    expect(attempts).toEqual(["model-a:false", "model-b:false", "model-c:true"]);
    expect(stubborn.calls).toBe(3); // first try + 2 repairs
  });

  it("retries a rate limit once before failing over", async () => {
    let n = 0;
    const flaky: ProviderAdapter = { call: async () => { if (n++ === 0) throw new ProviderError("slow down", 429, true); return { text: '{"word":"HEART","length":5}' }; } };
    const r = await ask(cfg(models, ["a"]), { p1: flaky });
    expect(r.meta.modelId).toBe("model-a");
    expect(n).toBe(2);
  });

  it("throws a typed error when the chain is exhausted, and an actionable one when no model is assigned", async () => {
    await expect(ask(cfg(models, ["a"]), { p1: returns("nope") })).rejects.toBeInstanceOf(AiChainExhaustedError);
    await expect(ask(cfg(models, []), {})).rejects.toBeInstanceOf(AiRouteMissingError);
    await expect(ask(cfg(models, []), {})).rejects.toThrow(/Admin/);
  });

  it("skips models that cannot read images and models without a key", async () => {
    const vision = profile("see", "p2", ["json_mode", "vision"]);
    const adapter = returns('{"word":"HEART","length":5}');
    const r = await ask(cfg({ a: models.a, v: vision }, ["a", "v"]), { p2: adapter }, { images: [{ mime: "image/png", dataBase64: "AAAA" }] });
    expect(r.meta.modelId).toBe("see");
    await expect(ask(cfg(models, ["a"]), {})).rejects.toBeInstanceOf(AiChainExhaustedError);
  });

  it("never names a model in code: the model id comes only from the config", async () => {
    const r = await ask(cfg({ a: profile("whatever-the-admin-typed", "p1") }, ["a"]), { p1: returns('{"word":"X","length":1}') });
    expect(r.meta.modelId).toBe("whatever-the-admin-typed");
  });
});

describe("tier batching and specialty suggestions", () => {
  it("batches by tier", () => {
    expect(batchPlan("tiny", EMPTY_AI_CONFIG)).toEqual({ maxChunkTokens: 1500, itemsPerCall: 5 });
    expect(batchPlan("strong", EMPTY_AI_CONFIG)).toEqual({ maxChunkTokens: 10_000, itemsPerCall: 25 });
  });
  it("sorts model names into specialties and suggests a route for every task", () => {
    const names = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "meta-llama/llama-4-scout-17b-16e-instruct", "openai/gpt-oss-120b", "whisper-large-v3"];
    const guesses = Object.fromEntries(names.map((n) => [n, guessModel(n)]));
    expect(guesses["whisper-large-v3"].specialty).toBe("not_chat");
    expect(guesses["llama-3.1-8b-instant"].specialty).toBe("fast");
    expect(guesses["meta-llama/llama-4-scout-17b-16e-instruct"].capabilities).toContain("vision");
    const routes = suggestRoutes(guesses);
    for (const t of TASKS) expect(routes[t]).not.toContain("whisper-large-v3");
    expect(routes.ingest_vision).toEqual(["meta-llama/llama-4-scout-17b-16e-instruct"]);
    expect(routes.outline[0]).toBe("llama-3.1-8b-instant");
  });
});
