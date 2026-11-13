import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { activeGeminiKey, refreshGeminiKey } from "@/lib/ai/api-key";
import { activeGroqKey, listGroqModels, refreshGroqKey } from "@/lib/ai/groq";
import { aiConfigSchema, EMPTY_AI_CONFIG, PROVIDER_PRESETS, AiRouteMissingError, type AiConfig, type ModelProfile, type ProviderAdapter, type ProviderKind, type ProviderMeta, type TaskName } from "./types";
import { geminiAdapter, openAiCompatibleAdapter } from "./adapters";
import { activeOpenRouterKey, refreshOpenRouterKey } from "@/lib/ai/openrouter";
import { OR_CLASS_INFO, worldOrClassFor } from "@/lib/ai/openrouter-models";
import { TASKS } from "./types";

const CONFIG_DOC = () => adminDb().collection("config").doc("ai");
const PROVIDERS_DOC = () => adminDb().collection("secrets").doc("aiProviders");

interface StoredProvider {
  kind: ProviderKind;
  label: string;
  baseUrl?: string;
  key?: string;
  last4?: string;
  updatedAt?: FirebaseFirestore.Timestamp;
}

let cache: { at: number; config: AiConfig } | null = null;
const TTL_MS = 10_000;

/** The admin's AI configuration (models, per-task routes, limits). Cached 10 seconds so edits apply quickly (spec 4.3). */
export async function getAiConfig(force = false): Promise<AiConfig> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.config;
  const snap = await CONFIG_DOC().get().catch(() => null);
  const parsed = snap?.exists ? aiConfigSchema.safeParse(snap.data()) : null;
  const config = parsed?.success ? parsed.data : EMPTY_AI_CONFIG;
  cache = { at: Date.now(), config };
  return config;
}

export async function saveAiConfig(config: AiConfig, by: { uid: string; email: string | null }): Promise<AiConfig> {
  const valid = aiConfigSchema.parse(config);
  // every route may only name models that are registered
  for (const [task, keys] of Object.entries(valid.routes)) {
    for (const k of keys) if (!valid.models[k]) throw new Error(`The route for "${task}" uses "${k}", which is not in the model list.`);
  }
  await CONFIG_DOC().set({ ...valid, updatedAt: Timestamp.now(), updatedBy: by.email ?? by.uid });
  cache = { at: Date.now(), config: valid };
  return valid;
}

async function readProviders(): Promise<Record<string, StoredProvider>> {
  const snap = await PROVIDERS_DOC().get().catch(() => null);
  return ((snap?.data()?.providers as Record<string, StoredProvider> | undefined) ?? {}) as Record<string, StoredProvider>;
}

/** Providers for the admin screen: never includes keys, only the last 4 characters. */
export async function listProviders(): Promise<Array<ProviderMeta & { configured: boolean; last4: string | null }>> {
  const stored = await readProviders();
  await Promise.all([refreshGeminiKey().catch(() => null), refreshGroqKey().catch(() => null)]);
  const geminiConfigured = Boolean(activeGeminiKey());
  const known = new Map<string, ProviderMeta>(PROVIDER_PRESETS.map((p) => [p.id, p]));
  for (const [id, p] of Object.entries(stored)) if (!known.has(id)) known.set(id, { id, kind: p.kind, label: p.label, baseUrl: p.baseUrl });
  return [...known.values()].map((p) => {
    const s = stored[p.id];
    const configured = p.kind === "gemini" ? geminiConfigured || Boolean(s?.key) : p.id === "groq" ? Boolean(s?.key) || Boolean(activeGroqKey()) : Boolean(s?.key);
    return { ...p, baseUrl: s?.baseUrl ?? p.baseUrl, label: s?.label ?? p.label, configured, last4: s?.last4 ?? null };
  });
}

export async function saveProviderKey(input: { id: string; kind: ProviderKind; label: string; baseUrl?: string; key: string }): Promise<void> {
  const key = input.key.trim();
  if (key.length < 8) throw new Error("That key looks too short.");
  const entry: StoredProvider = { kind: input.kind, label: input.label, baseUrl: input.baseUrl, key, last4: key.slice(-4), updatedAt: Timestamp.now() };
  await PROVIDERS_DOC().set({ providers: { [input.id]: JSON.parse(JSON.stringify(entry)) } }, { merge: true });
}

export async function removeProviderKey(id: string): Promise<void> {
  const { FieldValue } = await import("@/lib/firebase/admin");
  await PROVIDERS_DOC().update({ [`providers.${id}`]: FieldValue.delete() }).catch(() => null);
}

/** The key for a provider (server only). */
export async function providerKey(id: string): Promise<{ meta: StoredProvider | null; key: string } | null> {
  const stored = await readProviders();
  const meta = stored[id] ?? null;
  if (meta?.key) return { meta, key: meta.key };
  if (id === "gemini") {
    await refreshGeminiKey().catch(() => null);
    const k = activeGeminiKey();
    if (k) return { meta, key: k };
  }
  if (id === "groq") {
    await refreshGroqKey().catch(() => null);
    const k = activeGroqKey();
    if (k) return { meta, key: k };
  }
  if (id === "openrouter") {
    await refreshOpenRouterKey().catch(() => null);
    const k = activeOpenRouterKey();
    if (k) return { meta, key: k };
  }
  return null;
}

/** Builds the adapter for a provider id, or null when the admin has not added a key for it. */
export async function adapterFor(providerId: string): Promise<ProviderAdapter | null> {
  const found = await providerKey(providerId);
  if (!found) return null;
  const preset = PROVIDER_PRESETS.find((p) => p.id === providerId);
  const kind = found.meta?.kind ?? preset?.kind ?? "openai_compatible";
  if (kind === "gemini") return geminiAdapter(found.key);
  const baseUrl = found.meta?.baseUrl ?? preset?.baseUrl;
  if (!baseUrl) return null;
  return openAiCompatibleAdapter(baseUrl, found.key);
}

/** The ordered model chain for a task. An empty route is an actionable error (spec 4.3), never a silent default (R10). */
export async function resolveChain(task: TaskName, config?: AiConfig): Promise<ModelProfile[]> {
  const cfg = config ?? (await getAiConfig());
  const keys = cfg.routes[task] ?? [];
  const chain = keys.map((k) => cfg.models[k]).filter((m): m is ModelProfile => Boolean(m));
  if (chain.length === 0) throw new AiRouteMissingError(task);
  return chain;
}

/**
 * One-click setup from the keys the admin already added in "AI Key & Provider": registers the models those keys can use,
 * sorts them by specialty and suggests a route for every job. The admin can still change anything afterwards (R10:
 * these names come from the providers and the existing admin settings, never from code).
 */
export async function autoSetupFromExistingKeys(by: { uid: string; email: string | null }): Promise<{ config: AiConfig; added: number; notes: string[] }> {
  const { guessModel, suggestRoutes } = await import("./categories");
  const { resolveModelChain } = await import("@/lib/ai/router");
  const config: AiConfig = structuredClone(await getAiConfig(true));
  const notes: string[] = [];
  const guesses: Record<string, ReturnType<typeof guessModel>> = {};
  const register = (provider: string, id: string) => {
    const key = `${provider}:${id}`;
    const g = guessModel(id);
    if (g.specialty === "not_chat") return;
    if (!config.models[key]) {
      config.models[key] = { id, provider, capabilities: g.capabilities, contextTokens: g.tier === "tiny" ? 8000 : 32000, maxOutputTokens: g.tier === "tiny" ? 2048 : 4096, tier: g.tier };
    }
    guesses[key] = { ...g, tier: config.models[key].tier, capabilities: config.models[key].capabilities };
  };

  await refreshGeminiKey().catch(() => null);
  if (activeGeminiKey()) {
    const names = new Set<string>();
    for (const task of ["structured", "longdoc", "build", "tutor"]) for (const m of await resolveModelChain(task).catch(() => [] as string[])) names.add(m);
    names.forEach((m) => register("gemini", m));
    if (names.size === 0) notes.push("Gemini key found, but no Gemini models are set up. Add one by name in the Gemini card.");
  } else notes.push("No Gemini key yet.");

  await refreshGroqKey().catch(() => null);
  const gk = activeGroqKey();
  if (gk) {
    const list = await listGroqModels(gk);
    if (list) list.forEach((m) => register("groq", m));
    else notes.push("Groq key found, but Groq did not return its model list.");
  } else notes.push("No Groq key yet.");

  const routes = suggestRoutes(guesses);
  for (const t of Object.keys(routes) as Array<keyof typeof routes>) if (config.routes[t].length === 0) config.routes[t] = routes[t];

  // OpenRouter: each job gets the recommended cheap model for that kind of work first, with the other models behind it
  await refreshOpenRouterKey().catch(() => null);
  if (activeOpenRouterKey()) {
    for (const task of TASKS) {
      const cls = worldOrClassFor(task);
      const info = OR_CLASS_INFO[cls];
      const keys: string[] = [];
      for (const id of info.chain) {
        const key = `openrouter:${id}`;
        if (!config.models[key]) {
          config.models[key] = {
            id,
            provider: "openrouter",
            capabilities: info.needsImages ? ["json_mode", "json_schema", "vision", "long_context"] : ["json_mode", "json_schema", "long_context"],
            contextTokens: 262_000,
            maxOutputTokens: 16_000,
            tier: cls === "heavy" || cls === "grading" || cls === "code" ? "strong" : "standard",
          };
        }
        keys.push(key);
      }
      config.routes[task] = [...keys, ...config.routes[task].filter((k) => !keys.includes(k))].slice(0, 8);
    }
    notes.push("OpenRouter key found: every job now starts with its recommended model.");
  } else notes.push("No OpenRouter key yet.");
  const saved = await saveAiConfig(config, by);
  return { config: saved, added: Object.keys(guesses).length, notes };
}
