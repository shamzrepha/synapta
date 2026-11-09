import type { ZodType, ZodTypeDef } from "zod";
import { adapterFor, getAiConfig, resolveChain } from "./config";
import { buildRepairPrompt, describeZodError, parseJsonLoose } from "./json";
import { loadPrompt, UNIVERSAL_PREAMBLE } from "./prompts";
import { AiChainExhaustedError, ProviderError, type AiConfig, type ModelProfile, type ProviderAdapter, type TaskName, type Tier } from "./types";

export interface GenerateStructuredOptions<T> {
  task: TaskName;
  promptName: string;
  promptVars: Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: ZodType<T, ZodTypeDef, any>;
  images?: Array<{ mime: string; dataBase64: string }>;
  /** Optional JSON Schema, sent only to models that declare the json_schema capability. */
  jsonSchema?: object;
  maxRepairs?: number;
  /** 0 to 0.3 for extraction and checking; up to 0.7 only for creative text. */
  temperature?: number;
  maxTokens?: number;
  /** Test hooks and job logging: never receives raw document text. */
  adapterFor?: (providerId: string) => Promise<ProviderAdapter | null>;
  config?: AiConfig;
  onAttempt?: (info: { modelId: string; repairs: number; latencyMs: number; usage?: { in: number; out: number }; ok: boolean; reason?: string }) => void;
  sleep?: (ms: number) => Promise<void>;
}

export interface GenerateStructuredResult<T> {
  data: T;
  meta: { modelId: string; repairs: number; latencyMs: number; usage: { in: number; out: number } };
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Batch sizes follow the model tier (spec 4.4). The prompts and schemas are the same for every tier; only batching changes. */
export function batchPlan(tier: Tier, config: AiConfig): { maxChunkTokens: number; itemsPerCall: number } {
  const items: Record<Tier, number> = { tiny: 5, standard: 12, strong: 25 };
  return { maxChunkTokens: config.limits.maxChunkTokens[tier], itemsPerCall: items[tier] };
}

/**
 * The only door to a model for structured output (R11).
 * Algorithm (spec 4.2): resolve the chain for the task from admin config; build the prompt from its file plus the
 * Universal Preamble; call; parse JSON by brace matching; validate with zod; on failure run the repair loop; if it still
 * fails, fail over to the next model; if the chain is exhausted, throw a typed error the pipeline turns into `needs_retry`.
 */
export async function generateStructured<T>(opts: GenerateStructuredOptions<T>): Promise<GenerateStructuredResult<T>> {
  const config = opts.config ?? (await getAiConfig());
  const chain = await resolveChain(opts.task, config);
  const getAdapter = opts.adapterFor ?? adapterFor;
  const sleep = opts.sleep ?? defaultSleep;
  const maxRepairs = opts.maxRepairs ?? 2;
  const failures: Array<{ modelId: string; reason: string }> = [];

  const userPrompt = loadPrompt(opts.promptName, opts.promptVars);
  const wantsVision = Boolean(opts.images?.length);

  for (const model of chain) {
    if (wantsVision && !model.capabilities.includes("vision")) {
      failures.push({ modelId: model.id, reason: "cannot read images" });
      continue;
    }
    const adapter = await getAdapter(model.provider);
    if (!adapter) {
      failures.push({ modelId: model.id, reason: `no key for provider "${model.provider}"` });
      continue;
    }
    const result = await runOnModel(model, adapter, userPrompt, opts, maxRepairs, sleep);
    opts.onAttempt?.({ modelId: model.id, repairs: result.repairs, latencyMs: result.latencyMs, usage: result.usage, ok: result.ok, reason: result.ok ? undefined : result.reason });
    if (result.ok) return { data: result.data as T, meta: { modelId: model.id, repairs: result.repairs, latencyMs: result.latencyMs, usage: result.usage } };
    failures.push({ modelId: model.id, reason: result.reason });
  }
  throw new AiChainExhaustedError(opts.task, failures);
}

type RunResult = { ok: true; data: unknown; repairs: number; latencyMs: number; usage: { in: number; out: number } } | { ok: false; reason: string; repairs: number; latencyMs: number; usage: { in: number; out: number } };

async function runOnModel<T>(model: ModelProfile, adapter: ProviderAdapter, userPrompt: string, opts: GenerateStructuredOptions<T>, maxRepairs: number, sleep: (ms: number) => Promise<void>): Promise<RunResult> {
  const started = Date.now();
  const usage = { in: 0, out: 0 };
  const temperature = opts.temperature ?? 0.2;
  const maxTokens = opts.maxTokens ?? Math.min(4096, model.maxOutputTokens);
  let prompt = userPrompt;
  let lastOutput = "";
  let reason = "unknown failure";

  for (let repairs = 0; repairs <= maxRepairs; repairs++) {
    let text: string;
    // one short, jittered retry for rate limits and temporary provider errors, then give up on this model so the chain can take over
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await adapter.call({ model, system: UNIVERSAL_PREAMBLE, user: prompt, images: repairs === 0 ? opts.images : undefined, jsonSchema: opts.jsonSchema, temperature, maxTokens });
        text = res.text;
        usage.in += res.usage?.in ?? 0;
        usage.out += res.usage?.out ?? 0;
        break;
      } catch (e) {
        const err = e as ProviderError;
        if (err instanceof ProviderError && err.retryable && attempt === 0) {
          await sleep(400 + Math.floor(Math.random() * 600));
          continue;
        }
        return { ok: false, reason: err.message?.slice(0, 160) || "call failed", repairs, latencyMs: Date.now() - started, usage };
      }
    }
    lastOutput = text;
    const parsed = parseJsonLoose(text);
    if (!parsed.ok) {
      reason = parsed.error;
      prompt = buildRepairPrompt(lastOutput, parsed.error);
      continue;
    }
    const valid = opts.schema.safeParse(parsed.value);
    if (valid.success) return { ok: true, data: valid.data, repairs, latencyMs: Date.now() - started, usage };
    reason = `schema: ${describeZodError(valid.error, 3).replace(/\n/g, "; ")}`;
    prompt = buildRepairPrompt(lastOutput, describeZodError(valid.error));
  }
  return { ok: false, reason, repairs: maxRepairs, latencyMs: Date.now() - started, usage };
}
