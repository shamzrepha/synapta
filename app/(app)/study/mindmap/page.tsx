"use client";

import React, { useEffect, useState } from "react";
import { Loader2, Save, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { MindMapView } from "@/components/mindmap/mindmap-view";
import { TopicPicker, topicPayload, topicReady, type TopicChoice } from "@/components/study/topic-picker";
import { ExplainLevelToggle, useExplainLevel } from "@/components/study/explain-level-toggle";
import { asArray } from "@/lib/api/client";
import { clampTree, type MapNode } from "@/lib/mindmap/tree";

interface Saved {
  id: string;
  title: string;
  tree: MapNode;
  createdAt: string;
}

export default function MindMapPage() {
  const { toast } = useToast();
  const [level, setLevel] = useExplainLevel();
  const [topic, setTopic] = useState<TopicChoice>({ text: "", classId: "", kcId: "" });
  const [busy, setBusy] = useState(false);
  const [tree, setTree] = useState<MapNode | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [explain, setExplain] = useState<{ title: string; text: string; loading: boolean } | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);

  useEffect(() => {
    let alive = true;
    fetch("/api/mindmap")
      .then((r) => r.json())
      .then((j) => {
        if (alive && j.ok) setSaved(asArray<Saved>(j.data));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const show = (t: MapNode, id: string | null) => {
    setTree(t);
    setSavedId(id);
    setSelectedId(null);
    setExplain(null);
  };

  const generate = async () => {
    if (busy || !topicReady(topic)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/mindmap/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(topicPayload(topic)),
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error?.message || "Couldn't build the mind map.");
      show(j.data.tree as MapNode, null);
    } catch (e) {
      toast({ title: "Couldn't build it", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!tree || savedId) return;
    try {
      const res = await fetch("/api/mindmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: tree.title, tree }),
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error?.message || "Couldn't save.");
      setSaved((s) => [j.data as Saved, ...s]);
      setSavedId(j.data.id);
      toast({ title: "Mind map saved", variant: "success" });
    } catch (e) {
      toast({ title: "Couldn't save", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };

  const remove = (id: string) => {
    setSaved((s) => s.filter((m) => m.id !== id));
    if (savedId === id) setSavedId(null);
    fetch(`/api/mindmap/${id}`, { method: "DELETE" }).catch(() => {});
  };

  const explainNode = async (path: string[]) => {
    const title = path[path.length - 1];
    setExplain({ title, text: "", loading: true });
    try {
      const res = await fetch("/api/mindmap/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: path.slice(-8), level }),
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error?.message || "Couldn't explain that.");
      setExplain({ title, text: j.data.text, loading: false });
    } catch (e) {
      setExplain(null);
      toast({ title: "Couldn't explain that", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-8">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Mind-map maker</h1>
        <p className="text-sm text-slate-500">Turn a lesson or your notes into a map you can explore.</p>
      </div>

      <Card className="p-4 space-y-3">
        <TopicPicker value={topic} onChange={setTopic} textPlaceholder="Paste your notes or type a topic…" rows={5} />
        <Button onClick={generate} disabled={busy || !topicReady(topic)} size="lg" className="w-full">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Mapping…</> : "Make my mind map"}
        </Button>
      </Card>

      {tree && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold truncate flex-1">{tree.title}</h2>
            <ExplainLevelToggle value={level} onChange={setLevel} />
            <Button size="sm" variant="outline" onClick={save} disabled={Boolean(savedId)}>
              <Save className="h-3.5 w-3.5 mr-1" /> {savedId ? "Saved" : "Save"}
            </Button>
          </div>
          <MindMapView tree={tree} title={tree.title} selectedId={selectedId} onSelect={setSelectedId} onExplain={explainNode} />
          {explain && (
            <Card className="p-4 relative">
              <button type="button" aria-label="Close" onClick={() => setExplain(null)} className="absolute right-2 top-2 h-8 w-8 flex items-center justify-center text-slate-400">
                <X className="h-4 w-4" />
              </button>
              <div className="text-[11px] font-bold uppercase tracking-wide text-teal-600 pr-8">{explain.title}</div>
              {explain.loading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-3"><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</div>
              ) : (
                <MarkdownRenderer content={explain.text} />
              )}
            </Card>
          )}
        </section>
      )}

      {saved.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">Saved maps</h2>
          {saved.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-2 pl-3">
              <button
                type="button"
                className="min-w-0 flex-1 text-left min-h-[44px]"
                onClick={() => {
                  const t = clampTree(m.tree);
                  if (t) show(t, m.id);
                }}
              >
                <div className="text-sm font-semibold truncate">{m.title}</div>
                <div className="text-[11px] text-slate-500">{new Date(m.createdAt).toLocaleDateString()}</div>
              </button>
              <button type="button" aria-label="Delete" onClick={() => remove(m.id)} className="h-10 w-10 shrink-0 flex items-center justify-center text-slate-400 hover:text-rose-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
