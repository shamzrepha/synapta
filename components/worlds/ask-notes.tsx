"use client";

import React, { useState } from "react";
import { BookOpen, GraduationCap, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RichInline } from "@/components/markdown/rich-inline";
import { asArray } from "@/lib/api/client";
import type { TutorAnswer, TutorMode } from "@/lib/worlds/tutor";
import { SourceDrawer } from "./source-drawer";
import { cn } from "@/lib/utils";

const MODES: Array<{ id: TutorMode; label: string }> = [
  { id: "simple", label: "Explain simply" },
  { id: "exam", label: "Exam style" },
  { id: "quiz", label: "Quiz me" },
  { id: "compare", label: "Compare" },
  { id: "mnemonic", label: "Memory trick" },
];

/** A tutor that answers from her own notes and shows where each answer came from. Anything it adds is labelled. */
export function AskNotes({ worldId }: { worldId: string }) {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<TutorMode>("simple");
  const [busy, setBusy] = useState(false);
  const [a, setA] = useState<TutorAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<TutorAnswer["cited"][number]["source"] | null>(null);

  const ask = async () => {
    if (q.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const j = await (await fetch(`/api/worlds/${worldId}/tutor`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, mode }) })).json();
      if (j.ok) setA(j.data);
      else setError(j.error?.message || "Something went wrong.");
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <p className="font-bold flex items-center gap-2"><GraduationCap className="h-4 w-4 text-brand-600" /> Ask about my notes</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="How to answer">
        {MODES.map((m) => <button key={m.id} type="button" onClick={() => setMode(m.id)} aria-pressed={mode === m.id} className={cn("rounded-full border px-3 py-1 text-xs", mode === m.id ? "border-brand-600 bg-brand-500/10 font-semibold" : "border-border text-muted-foreground")}>{m.label}</button>)}
      </div>
      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder="Ask anything from your notes" aria-label="Your question" className="h-11 flex-1 rounded-lg border border-border bg-background px-3 text-sm" maxLength={600} />
        <Button onClick={ask} isLoading={busy} disabled={q.trim().length < 2} aria-label="Ask"><Send className="h-4 w-4" /></Button>
      </div>
      {error && <p className="text-xs text-rose-600" role="status">{error}</p>}
      {a && (
        <div className="space-y-2 text-sm" role="status" aria-live="polite">
          <p className="leading-relaxed"><RichInline text={a.answer} /></p>
          {asArray<TutorAnswer["cited"][number]>(a.cited).length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">From your notes</p>
              {asArray<TutorAnswer["cited"][number]>(a.cited).map((c) => (
                <button key={c.id} type="button" onClick={() => setSource(c.source)} className="flex w-full items-start gap-2 rounded-md border border-border px-2 py-1.5 text-left text-xs hover:border-brand-500/60"><BookOpen className="h-3.5 w-3.5 mt-0.5 shrink-0 text-brand-600" /><span>{c.statement}</span></button>
              ))}
            </div>
          )}
          {!a.inNotes && asArray(a.cited).length === 0 && <p className="text-xs text-muted-foreground">This isn&apos;t in your notes.</p>}
          {a.aiAdded && (
            <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground"><span className="font-semibold">AI-added, not from your notes: </span><RichInline text={a.aiAdded} /></p>
          )}
        </div>
      )}
      {source && <SourceDrawer anchor={source} onClose={() => setSource(null)} />}
    </Card>
  );
}
