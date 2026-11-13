"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Network } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { asArray } from "@/lib/api/client";

interface KeyInfo {
  source: "admin" | "environment" | "none";
  last4: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}
interface ClassRow {
  id: string;
  label: string;
  why: string;
  recommended: string[];
  pick: string;
}

/**
 * Admin: OpenRouter. One key reaches many model makers; each kind of work gets the cheapest model that is good at it (the recommended
 * chains), and any of them can be changed here. Voice: when the free voice is unavailable, an open voice model speaks through the same key.
 */
export function OpenRouterSettings({ onChanged }: { onChanged?: () => void }) {
  const [info, setInfo] = useState<KeyInfo | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    fetch("/api/admin/system/openrouter-key").then((r) => r.json()).then((j) => j.ok && setInfo(j.data)).catch(() => null);
    fetch("/api/admin/system/openrouter-models")
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return;
        setClasses(j.data.classes);
        setDrafts(Object.fromEntries((j.data.classes as ClassRow[]).map((c) => [c.id, c.pick])));
      })
      .catch(() => null);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    const clean = key.trim().replace(/^["'`]|["'`]$/g, "").trim();
    if (!clean) return;
    setBusy(true);
    setMsg(null);
    try {
      const j = await fetch("/api/admin/system/openrouter-key", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: clean }) }).then((r) => r.json());
      if (j.ok) {
        setInfo(j.data);
        setKey("");
        setMsg({ ok: true, text: "OpenRouter key checked and saved." });
        onChanged?.();
      } else setMsg({ ok: false, text: j.error?.message || "Couldn't save the key." });
    } catch {
      setMsg({ ok: false, text: "Couldn't save the key." });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      const j = await fetch("/api/admin/system/openrouter-key", { method: "DELETE" }).then((r) => r.json());
      if (j.ok) {
        setInfo(j.data);
        setMsg({ ok: true, text: "OpenRouter key removed." });
        onChanged?.();
      }
    } finally {
      setBusy(false);
    }
  };
  const savePick = async (c: ClassRow) => {
    const model = (drafts[c.id] || "").trim();
    const j = await fetch("/api/admin/system/openrouter-models", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ class: c.id, model }) }).then((r) => r.json()).catch(() => null);
    setMsg(j?.ok ? { ok: true, text: model ? `${c.label}: ${model} goes first.` : `${c.label}: back to the recommendation.` } : { ok: false, text: j?.error?.message || "Couldn't save that model." });
    if (j?.ok) load();
  };

  return (
    <Card className="p-5 space-y-4 border-violet-500/20">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-violet-500/10 text-violet-500 flex items-center justify-center shrink-0">
          <Network className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-sm text-foreground">OpenRouter (many models, one key)</p>
          <p className="text-xs text-muted-foreground">
            {info?.source === "admin" && <>In use: key ending <b translate="no" className="text-foreground">…{info.last4}</b>, set here{info.updatedBy ? ` by ${info.updatedBy}` : ""}.</>}
            {info?.source === "environment" && <>In use: key ending <b translate="no" className="text-foreground">…{info.last4}</b> from the server environment.</>}
            {info?.source === "none" && "No OpenRouter key yet."}
            {!info && "Checking OpenRouter…"}
          </p>
        </div>
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Input type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste OpenRouter key (starts with sk-or-...)" className="flex-1 font-mono text-sm" aria-label="New OpenRouter API key" />
        <Button type="submit" isLoading={busy} disabled={!key.trim()}>Test &amp; save key</Button>
      </form>
      <p className="text-xs text-muted-foreground">
        Create a key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline text-brand-600 dark:text-brand-400 font-medium">openrouter.ai/keys</a> and add a small credit. Set a monthly limit on the key there. With a key saved, OpenRouter also steps in when Gemini runs out, and speaks podcast and reading lines when the free voice is unavailable.
      </p>
      {msg && (
        <p className={`text-xs font-semibold flex items-center gap-1.5 ${msg.ok ? "text-brand-700 dark:text-brand-300" : "text-rose-600"}`} role="status">
          {msg.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {msg.text}
        </p>
      )}
      {info?.source === "admin" && (
        <button type="button" onClick={remove} disabled={busy} className="text-xs font-semibold text-muted-foreground underline hover:text-foreground">Remove this OpenRouter key</button>
      )}

      <div className="pt-3 border-t border-border space-y-3">
        <p className="font-bold text-sm text-foreground">Which model does which job</p>
        <p className="text-xs text-muted-foreground">Each kind of work starts with the recommended model and falls back down the list if it fails. Type a model id (vendor/name, copied from openrouter.ai/models) to put your own first, or clear the box to go back.</p>
        {asArray<ClassRow>(classes).map((c) => (
          <div key={c.id} className="rounded-lg border border-border p-3 space-y-1.5">
            <p className="text-sm font-semibold">{c.label}</p>
            <p className="text-xs text-muted-foreground">{c.why}</p>
            <p className="text-[11px] text-muted-foreground font-mono break-words" translate="no">Recommended: {c.recommended.join("  →  ")}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input value={drafts[c.id] ?? ""} onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))} placeholder={`Put your own first (now: ${c.recommended[0]})`} className="flex-1 font-mono text-xs" aria-label={`Model for ${c.label}`} list={`or-${c.id}`} />
              <datalist id={`or-${c.id}`}>{asArray<string>(c.recommended).map((m) => <option key={m} value={m} />)}</datalist>
              <Button size="sm" variant="outline" onClick={() => savePick(c)} disabled={(drafts[c.id] ?? "") === c.pick}>Save</Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
