"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, Play, Plus, Sparkles, Trash2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { guessModel, suggestRoutes, type ModelGuess } from "@/lib/ai/structured/categories";
import type { AiConfig, Capability, ModelProfile, ProviderMeta, TaskName, Tier } from "@/lib/ai/structured/types";
import { cn } from "@/lib/utils";

type ProviderRow = ProviderMeta & { configured: boolean; last4: string | null };
interface TaskRow {
  key: TaskName;
  label: string;
  hint: string;
  needs: "vision" | "text";
}
interface Loaded {
  config: AiConfig;
  providers: ProviderRow[];
  presets: ProviderMeta[];
  tasks: TaskRow[];
}
interface TestResult {
  passed: boolean;
  modelId?: string;
  latencyMs?: number;
  repairs?: number;
  message?: string;
}

const SPECIALTY_LABEL: Record<string, string> = { vision: "Sees images", reasoning: "Careful reasoning", strong: "Strong general", fast: "Fast and small", not_chat: "Not for chat" };

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
    const j = await res.json();
    return j.ok ? { ok: true, data: j.data } : { ok: false, message: j.error?.message || "Something went wrong." };
  } catch {
    return { ok: false, message: "Network error. Check your connection." };
  }
}

/**
 * Admin: which AI models SunRoot Worlds uses, and which model does which job. Works with any provider that speaks the
 * OpenAI-style API (Groq, Cerebras, OpenRouter, Mistral, SambaNova, Together, ...) and with Gemini. Nothing is preselected:
 * the admin decides, and the Test button proves each choice works.
 */
export function WorldsAiSettings() {
  const { toast } = useToast();
  const [data, setData] = useState<Loaded | null>(null);
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [found, setFound] = useState<Record<string, ModelGuess[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [tests, setTests] = useState<Partial<Record<TaskName, TestResult | "running">>>({});
  const [customId, setCustomId] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [manual, setManual] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const r = await api<Loaded>("/api/admin/worlds/ai");
    if (r.ok) {
      setData(r.data);
      setConfig(r.data.config);
      setDirty(false);
    } else toast({ title: "Couldn't load the AI setup", description: r.message, variant: "destructive" });
  }, [toast]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const providers = useMemo(() => asArray<ProviderRow>(data?.providers), [data]);
  const modelKeys = useMemo(() => Object.keys(config?.models ?? {}), [config]);
  const update = (fn: (c: AiConfig) => AiConfig) => {
    setConfig((c) => (c ? fn(structuredClone(c)) : c));
    setDirty(true);
  };

  const saveKey = async (p: ProviderRow, baseUrl?: string) => {
    const key = keys[p.id]?.trim();
    if (!key) return;
    setBusy(`key:${p.id}`);
    const r = await api<{ providers: ProviderRow[] }>("/api/admin/worlds/ai/providers", { method: "PUT", body: JSON.stringify({ id: p.id, kind: p.kind, label: p.label, baseUrl: baseUrl ?? p.baseUrl, key }) });
    setBusy(null);
    if (!r.ok) return toast({ title: "Couldn't save the key", description: r.message, variant: "destructive" });
    setKeys((k) => ({ ...k, [p.id]: "" }));
    setData((d) => (d ? { ...d, providers: r.data.providers } : d));
    toast({ title: `${p.label} key saved`, variant: "success" });
  };

  const findModels = async (p: ProviderRow) => {
    setBusy(`find:${p.id}`);
    const r = await api<{ models: ModelGuess[] }>("/api/admin/worlds/ai/models", { method: "POST", body: JSON.stringify({ providerId: p.id }) });
    setBusy(null);
    if (!r.ok) return toast({ title: "Couldn't list models", description: r.message, variant: "destructive" });
    setFound((f) => ({ ...f, [p.id]: asArray<ModelGuess>(r.data.models) }));
  };

  const addModel = (providerId: string, g: ModelGuess) => {
    const key = `${providerId}:${g.id}`;
    const profile: ModelProfile = {
      id: g.id,
      provider: providerId,
      capabilities: g.capabilities,
      contextTokens: g.tier === "tiny" ? 8000 : 32000,
      maxOutputTokens: g.tier === "tiny" ? 2048 : 4096,
      tier: g.tier,
    };
    update((c) => ({ ...c, models: { ...c.models, [key]: profile } }));
  };
  const removeModel = (key: string) =>
    update((c) => {
      delete c.models[key];
      for (const t of Object.keys(c.routes) as TaskName[]) c.routes[t] = c.routes[t].filter((k) => k !== key);
      return c;
    });
  const toggleCap = (key: string, cap: Capability) =>
    update((c) => {
      const m = c.models[key];
      m.capabilities = m.capabilities.includes(cap) ? m.capabilities.filter((x) => x !== cap) : [...m.capabilities, cap];
      return c;
    });
  const setTier = (key: string, tier: Tier) =>
    update((c) => {
      c.models[key].tier = tier;
      return c;
    });
  const setRoute = (task: TaskName, slot: number, key: string) =>
    update((c) => {
      const list = [...c.routes[task]];
      if (key) list[slot] = key;
      else list.splice(slot, 1);
      c.routes[task] = list.filter(Boolean).filter((k, i, a) => a.indexOf(k) === i);
      return c;
    });
  const autoSetup = async () => {
    setBusy("auto");
    const r = await api<{ config: AiConfig; added: number; notes: string[] }>("/api/admin/worlds/ai/auto", { method: "POST", body: "{}" });
    setBusy(null);
    if (!r.ok) return toast({ title: "Couldn't set up", description: r.message, variant: "destructive" });
    setConfig(r.data.config);
    setDirty(false);
    await load();
    toast({ title: r.data.added ? `Set up ${r.data.added} models from your keys` : "No models found", description: asArray<string>(r.data.notes).join(" ") || "Now press Test on each job.", variant: r.data.added ? "success" : "amber" });
  };
  const suggest = () => {
    if (!config) return;
    const guesses: Record<string, ModelGuess> = {};
    for (const [k, m] of Object.entries(config.models)) guesses[k] = { ...guessModel(m.id), tier: m.tier, capabilities: m.capabilities };
    const routes = suggestRoutes(guesses);
    update((c) => ({ ...c, routes: { ...c.routes, ...routes } }));
    toast({ title: "Suggested a model for each job", description: "Review them, then press Save.", variant: "success" });
  };

  const save = async () => {
    if (!config) return;
    setBusy("save");
    const r = await api<{ config: AiConfig }>("/api/admin/worlds/ai", { method: "PUT", body: JSON.stringify(config) });
    setBusy(null);
    if (!r.ok) return toast({ title: "Couldn't save", description: r.message, variant: "destructive" });
    setConfig(r.data.config);
    setDirty(false);
    toast({ title: "Saved. Changes apply within seconds.", variant: "success" });
  };

  const [quality, setQuality] = useState<{ running: boolean; report?: { passed: boolean; groundingPct: number; recallPct: number; unitsKept: number; unitsDropped: number; repairs: number; failures: number; latencyMs: number; notes: string[] }; error?: string }>({ running: false });
  const runQuality = async () => {
    setQuality({ running: true });
    const r = await api<{ report?: NonNullable<typeof quality.report>; error?: string }>("/api/admin/worlds/ai/conformance", { method: "POST", body: "{}" });
    setQuality(r.ok ? { running: false, report: r.data.report, error: r.data.error } : { running: false, error: r.message });
  };
  const test = async (task: TaskName) => {
    setTests((t) => ({ ...t, [task]: "running" }));
    const r = await api<TestResult>("/api/admin/worlds/ai/test", { method: "POST", body: JSON.stringify({ task }) });
    setTests((t) => ({ ...t, [task]: r.ok ? r.data : { passed: false, message: r.message } }));
  };

  if (!data || !config) {
    return (
      <Card className="p-5 flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading the Worlds AI setup…
      </Card>
    );
  }

  const addable = providers.filter((p) => p.configured);
  const customProviders = providers.filter((p) => !asArray<ProviderMeta>(data.presets).some((x) => x.id === p.id));

  return (
    <Card className="p-5 space-y-6">
      <div>
        <h2 className="font-bold text-lg flex items-center gap-2"><Sparkles className="h-5 w-5 text-brand-600" /> Worlds AI models</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Add a provider key, pull its models, then choose which model does each job. Models that suit a job (for example one that can see images for handwriting) are suggested. Free tiers change often, so check each provider&apos;s console for current limits.
        </p>
      </div>

      <div className="rounded-lg border border-brand-500/40 bg-brand-500/5 p-3 flex flex-wrap items-center gap-3">
        <p className="text-sm flex-1 min-w-[200px]"><span className="font-semibold">Fastest way:</span> use the Gemini and Groq keys you already added. This finds their models and picks a good one for each job. You can change anything after.</p>
        <Button size="sm" onClick={autoSetup} isLoading={busy === "auto"}><Sparkles className="h-4 w-4 mr-1.5" /> Set up from my existing keys</Button>
      </div>

      {/* 1. providers */}
      <section className="space-y-3">
        <h3 className="font-semibold text-sm">1. Providers</h3>
        <div className="grid gap-2">
          {providers.map((p) => (
            <div key={p.id} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-sm">{p.label}</span>
                {p.configured ? (
                  <span className="flex items-center gap-1 text-xs text-teal-600"><CheckCircle2 className="h-3.5 w-3.5" /> Key added{p.last4 ? ` (…${p.last4})` : ""}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">No key yet</span>
                )}
                {p.configured && p.kind === "openai_compatible" && (
                  <Button size="sm" variant="outline" className="ml-auto" onClick={() => findModels(p)} isLoading={busy === `find:${p.id}`}>Find models</Button>
                )}
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type="password" autoComplete="off" value={keys[p.id] || ""} onChange={(e) => setKeys((k) => ({ ...k, [p.id]: e.target.value }))} placeholder={p.configured ? "Paste a new key to replace it" : "Paste the API key"} className="pl-9" aria-label={`${p.label} API key`} />
                </div>
                <Button size="sm" onClick={() => saveKey(p)} disabled={!keys[p.id]?.trim()} isLoading={busy === `key:${p.id}`}>Save key</Button>
              </div>
              {found[p.id] && (
                <div className="flex flex-wrap gap-1.5 pt-1" aria-label={`Models from ${p.label}`}>
                  {asArray<ModelGuess>(found[p.id]).filter((g) => g.specialty !== "not_chat").map((g) => {
                    const key = `${p.id}:${g.id}`;
                    const added = Boolean(config.models[key]);
                    return (
                      <button key={g.id} type="button" disabled={added} onClick={() => addModel(p.id, g)} className={cn("rounded-md border px-2 py-1 text-xs text-left", added ? "border-brand-500/50 bg-brand-500/10" : "border-border hover:border-brand-500/60")}>
                        <span className="font-medium">{g.id}</span> <span className="text-muted-foreground">· {SPECIALTY_LABEL[g.specialty]}</span> {added ? "✓" : <Plus className="inline h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>
              )}
              {p.kind === "gemini" && p.configured && (
                <div className="flex gap-2 pt-1">
                  <Input value={manual[p.id] || ""} onChange={(e) => setManual((m) => ({ ...m, [p.id]: e.target.value }))} placeholder="Type a Gemini model name to add" aria-label="Gemini model name" />
                  <Button size="sm" variant="outline" disabled={!manual[p.id]?.trim()} onClick={() => { addModel(p.id, { ...guessModel(manual[p.id].trim()), id: manual[p.id].trim() }); setManual((m) => ({ ...m, [p.id]: "" })); }}>Add</Button>
                </div>
              )}
            </div>
          ))}
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Add another provider (any OpenAI-compatible address)</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <Input value={customId} onChange={(e) => setCustomId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} placeholder="short name (e.g. qwen)" aria-label="Provider short name" />
            <Input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="https://…/v1" aria-label="Provider API address" />
            <Button size="sm" variant="outline" disabled={customId.length < 2 || !customUrl.startsWith("https://") || customProviders.some((p) => p.id === customId)} onClick={() => {
              setData((d) => (d ? { ...d, providers: [...d.providers, { id: customId, kind: "openai_compatible", label: customId, baseUrl: customUrl, configured: false, last4: null }] } : d));
              setCustomId("");
              setCustomUrl("");
            }}>Add</Button>
          </div>
        </details>
      </section>

      {/* 2. registered models */}
      <section className="space-y-3">
        <h3 className="font-semibold text-sm">2. Models you can use ({modelKeys.length})</h3>
        {modelKeys.length === 0 && <p className="text-sm text-muted-foreground">Add a key above, press Find models, and tap the models you want.</p>}
        <div className="grid gap-2">
          {modelKeys.map((k) => {
            const m = config.models[k];
            return (
              <div key={k} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <span className="font-medium min-w-0 truncate">{m.id}</span>
                <span className="text-xs text-muted-foreground">{providers.find((p) => p.id === m.provider)?.label ?? m.provider}</span>
                <select value={m.tier} onChange={(e) => setTier(k, e.target.value as Tier)} className="ml-auto h-8 rounded-md border border-border bg-background px-2 text-xs" aria-label={`Size of ${m.id}`}>
                  <option value="tiny">Small (needs short chunks)</option>
                  <option value="standard">Standard</option>
                  <option value="strong">Strong</option>
                </select>
                {(["vision", "json_mode"] as Capability[]).map((cap) => (
                  <label key={cap} className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={m.capabilities.includes(cap)} onChange={() => toggleCap(k, cap)} /> {cap === "vision" ? "Sees images" : "JSON mode"}
                  </label>
                ))}
                <button type="button" onClick={() => removeModel(k)} aria-label={`Remove ${m.id}`} className="text-muted-foreground hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. routes */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-sm">3. Which model does which job</h3>
          <Button size="sm" variant="outline" className="ml-auto" onClick={suggest} disabled={modelKeys.length === 0}><Sparkles className="h-4 w-4 mr-1" /> Suggest by specialty</Button>
        </div>
        <div className="grid gap-3">
          {asArray<TaskRow>(data.tasks).map((t) => {
            const list = config.routes[t.key] ?? [];
            const result = tests[t.key];
            return (
              <div key={t.key} className="rounded-lg border border-border p-3 space-y-2">
                <div>
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.hint}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[0, 1, 2].map((slot) => {
                    if (slot > list.length) return null;
                    return (
                      <select key={slot} value={list[slot] ?? ""} onChange={(e) => setRoute(t.key, slot, e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm min-w-0 max-w-full" aria-label={`${t.label}, ${slot === 0 ? "first choice" : `backup ${slot}`}`}>
                        <option value="">{slot === 0 ? "Choose a model…" : "(no backup)"}</option>
                        {modelKeys.filter((k) => t.needs !== "vision" || config.models[k].capabilities.includes("vision")).map((k) => <option key={k} value={k}>{config.models[k].id}</option>)}
                      </select>
                    );
                  })}
                  <Button size="sm" variant="outline" onClick={() => test(t.key)} disabled={list.length === 0 || dirty || result === "running"} title={dirty ? "Save first, then test" : undefined}>
                    {result === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 mr-1" />} Test
                  </Button>
                </div>
                {list.length === 0 && <p className="text-xs text-amber-600">No model assigned: Worlds can&apos;t run this step yet.</p>}
                {result && result !== "running" && (
                  <p className={cn("flex items-start gap-1.5 text-xs", result.passed ? "text-teal-600" : "text-rose-600")} role="status">
                    {result.passed ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5" /> : <XCircle className="h-3.5 w-3.5 mt-0.5" />}
                    {result.passed ? `Works: ${result.modelId} answered in ${Math.round((result.latencyMs ?? 0) / 100) / 10}s${result.repairs ? ` (fixed ${result.repairs} time${result.repairs > 1 ? "s" : ""})` : ""}.` : result.message}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-sm">4. Quality check</h3>
          <Button size="sm" variant="outline" className="ml-auto" onClick={runQuality} disabled={dirty || quality.running}>{quality.running ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />} Run on a sample note</Button>
        </div>
        <p className="text-xs text-muted-foreground">Reads a known sample note with the models you chose for &quot;Pull out the key facts&quot; and scores how many facts it found and how many were really in the note.</p>
        {quality.error && <p className="text-xs text-rose-600" role="status">{quality.error}</p>}
        {quality.report && (
          <div className={cn("rounded-lg border p-3 text-sm space-y-1", quality.report.passed ? "border-teal-600/50 bg-teal-500/5" : "border-orange-500/50 bg-orange-500/5")} role="status">
            <p className="font-semibold flex items-center gap-1.5">{quality.report.passed ? <CheckCircle2 className="h-4 w-4 text-teal-600" /> : <XCircle className="h-4 w-4 text-orange-600" />} {quality.report.passed ? "Good enough for real notes" : "Not good enough yet"}</p>
            <p>Found in the notes: {quality.report.groundingPct}% (aim for 95%) · Key facts found: {quality.report.recallPct}% · Facts kept: {quality.report.unitsKept}, dropped: {quality.report.unitsDropped} · Fixes needed: {quality.report.repairs} · Time: {Math.round(quality.report.latencyMs / 1000)}s</p>
            {asArray<string>(quality.report.notes).map((n) => <p key={n} className="text-xs text-muted-foreground">{n}</p>)}
          </div>
        )}
      </section>

      <div className="flex items-center gap-3 sticky bottom-0 bg-card/95 backdrop-blur py-3 border-t border-border -mx-5 px-5">
        <Button onClick={save} disabled={!dirty} isLoading={busy === "save"}>Save</Button>
        <span className="text-xs text-muted-foreground">{dirty ? "You have unsaved changes." : addable.length === 0 ? "Add a provider key to begin." : "Saved."}</span>
      </div>
    </Card>
  );
}
