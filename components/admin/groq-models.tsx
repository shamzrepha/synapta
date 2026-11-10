"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { AI_TASK_DEFINITIONS } from "@/lib/ai/tasks";

interface Loaded {
  hasKey: boolean;
  modelsKnown: boolean;
  models: { id: string; group: string }[];
  assignments: Record<string, string>;
  defaults: Record<string, string>;
}

const GROUP_ORDER = ["Heavy (best quality)", "Reasoning", "Fast (light work)", "Vision", "Other"];

/** Admin: pick which Groq model handles each AI job (shown when the provider is Groq), like the Gemini picker. */
export function GroqModelAssignments() {
  const { toast } = useToast();
  const [data, setData] = useState<Loaded | null>(null);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/system/groq-models");
      const j = await res.json();
      if (!j.ok) throw new Error(j.error?.message || "Could not load Groq models");
      setData(j.data as Loaded);
      setPicks((j.data as Loaded).assignments || {});
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Groq models");
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const m of asArray<{ id: string; group: string }>(data?.models)) out.set(m.group, [...(out.get(m.group) || []), m.id]);
    return GROUP_ORDER.filter((g) => out.has(g)).map((g) => ({ group: g, ids: out.get(g)! }));
  }, [data]);

  const tasks = Object.keys(AI_TASK_DEFINITIONS);
  const dirty = JSON.stringify(picks) !== JSON.stringify(data?.assignments || {});

  const save = async () => {
    setSaving(true);
    try {
      const clean = Object.fromEntries(Object.entries(picks).filter(([, v]) => v));
      const res = await fetch("/api/admin/system/groq-models", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignments: clean }) });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error?.message || "Save failed");
      toast({ title: "Groq models saved", description: "They apply to the next AI request.", variant: "success" });
      await load();
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (error) return <Card className="p-4 text-sm text-danger">{error}</Card>;
  if (!data) return <Card className="p-4 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading Groq models…</Card>;

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="font-semibold">Groq models per task</h3>
        <p className="text-sm text-muted-foreground">
          Used whenever the provider above is set to Groq. Choose which Groq model does each job, just like the Gemini list. Leave a task on &quot;Automatic&quot; to use the built-in pick (a big model for heavy work, a fast one for light work).
          {!data.hasKey && " Add your Groq key above to load the list of models you can use."}
          {data.hasKey && !data.modelsKnown && " Could not read the model list from Groq right now; automatic picks still work."}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {tasks.map((t) => (
          <label key={t} className="text-sm space-y-1">
            <span className="font-medium">{t.replace(/_/g, " ")}</span>
            <select
              className="w-full h-10 rounded-lg border border-border bg-background px-2 text-sm"
              value={picks[t] || ""}
              onChange={(e) => setPicks((p) => ({ ...p, [t]: e.target.value }))}
            >
              <option value="">Automatic ({data.defaults[t]})</option>
              {picks[t] && !asArray<{ id: string }>(data.models).some((m) => m.id === picks[t]) && <option value={picks[t]}>{picks[t]}</option>}
              {grouped.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.ids.map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Button onClick={save} isLoading={saving} disabled={!dirty}>Save Groq models</Button>
        <Button variant="outline" onClick={() => setPicks({})} disabled={Object.keys(picks).length === 0}>Reset all to automatic</Button>
      </div>
    </Card>
  );
}
