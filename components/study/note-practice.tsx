"use client";

import React, { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { fetchJson } from "@/lib/api/client";
import type { NoteCards, NoteQuiz } from "@/lib/study/note-practice";
import { cn } from "@/lib/utils";

function useMade<T>(noteId: string, kind: "flashcards" | "quiz", pick: (d: Record<string, unknown>) => T | undefined) {
  const [items, setItems] = useState<T | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const make = async (regenerate = false) => {
    setBusy(true);
    setError("");
    const j = await fetchJson<Record<string, unknown>>(`/api/study/notes/${noteId}/practice`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, regenerate }) });
    if (j.ok) setItems(pick(j.data) ?? null);
    else setError(j.error.message);
    setBusy(false);
  };
  useEffect(() => {
    const t = setTimeout(() => void make(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, kind]);
  return { items, busy, error, make };
}

function Shell({ busy, error, retry, children, label }: { busy: boolean; error: string; retry: () => void; children: React.ReactNode; label: string }) {
  if (busy)
    return (
      <Card className="p-8 text-center space-y-2">
        <Loader2 className="h-6 w-6 animate-spin text-teal-600 mx-auto" />
        <p className="text-sm font-semibold">{label}</p>
      </Card>
    );
  if (error)
    return (
      <Card className="p-6 text-center space-y-3">
        <p className="text-sm">{error}</p>
        <Button size="sm" onClick={retry}>Try again</Button>
      </Card>
    );
  return <>{children}</>;
}

export function NoteFlashcards({ noteId }: { noteId: string }) {
  const { items, busy, error, make } = useMade<NoteCards>(noteId, "flashcards", (d) => d.cards as NoteCards);
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());
  const cards = items || [];
  const left = cards.map((_, k) => k).filter((k) => !known.has(k));
  const idx = left.includes(i) ? i : left[0] ?? 0;
  const card = cards[idx];
  return (
    <Shell busy={busy} error={error} retry={() => make()} label="Making your flashcards…">
      {cards.length > 0 && (
        <Card className="p-4 md:p-6 space-y-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="flex-1">{known.size} of {cards.length} known</span>
            <Button size="sm" variant="ghost" onClick={() => { setKnown(new Set()); setFlip(false); setI(0); void make(true); }}><RefreshCw className="h-3.5 w-3.5 mr-1" /> New set</Button>
          </div>
          {left.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-3xl" aria-hidden>🎉</p>
              <p className="font-bold">You know them all.</p>
              <Button size="sm" variant="outline" onClick={() => { setKnown(new Set()); setFlip(false); }}>Go again</Button>
            </div>
          ) : (
            <>
              <button type="button" onClick={() => setFlip((f) => !f)} className={cn("w-full min-h-[180px] rounded-2xl border-2 p-5 text-left transition-colors", flip ? "border-teal-500 bg-teal-500/5" : "border-slate-300 dark:border-slate-700")} aria-label={flip ? "Show the question" : "Show the answer"}>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">{flip ? "Answer" : "Question"}</p>
                <MarkdownRenderer content={flip ? card.back : card.front} className="text-base" localized />
                {!flip && <p className="text-xs text-slate-400 mt-3">Tap to flip</p>}
              </button>
              {flip && (
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => { setFlip(false); setI(left[(left.indexOf(idx) + 1) % left.length]); }}>Still learning</Button>
                  <Button onClick={() => { setFlip(false); setKnown((s) => new Set(s).add(idx)); setI(left.find((k) => k > idx) ?? left[0]); }}>I knew it</Button>
                </div>
              )}
            </>
          )}
        </Card>
      )}
    </Shell>
  );
}

export function NoteQuiz({ noteId }: { noteId: string }) {
  const { items, busy, error, make } = useMade<NoteQuiz>(noteId, "quiz", (d) => d.questions as NoteQuiz);
  const [q, setQ] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const qs = items || [];
  const finished = qs.length > 0 && q >= qs.length;
  const cur = qs[q];
  const restart = (fresh: boolean) => {
    setQ(0);
    setPicked(null);
    setScore(0);
    if (fresh) void make(true);
  };
  return (
    <Shell busy={busy} error={error} retry={() => make()} label="Writing your quiz…">
      {qs.length > 0 && (
        <Card className="p-4 md:p-6 space-y-4">
          {finished ? (
            <div className="text-center py-6 space-y-3">
              <p className="text-3xl" aria-hidden>{score === qs.length ? "🏆" : "👏"}</p>
              <p className="font-bold text-lg">{score} out of {qs.length}</p>
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={() => restart(false)}>Try the same questions</Button>
                <Button onClick={() => restart(true)}>New quiz</Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500">Question {q + 1} of {qs.length}</p>
              <MarkdownRenderer content={cur.question} className="font-semibold" localized />
              <div className="space-y-2" role="group" aria-label="Answers">
                {cur.options.map((o, k) => {
                  const right = k === cur.correctIndex;
                  return (
                    <button key={k} type="button" disabled={picked !== null} onClick={() => { setPicked(k); if (right) setScore((s) => s + 1); }} className={cn("w-full text-left rounded-xl border px-3 py-2 text-sm", picked === null ? "border-slate-300 dark:border-slate-700 hover:border-teal-500" : right ? "border-emerald-500 bg-emerald-500/10" : k === picked ? "border-rose-500 bg-rose-500/10" : "border-slate-200 dark:border-slate-800 opacity-60")}>
                      <MarkdownRenderer content={o} className="prose-p:my-0" localized />
                    </button>
                  );
                })}
              </div>
              {picked !== null && (
                <div className="space-y-2" role="status">
                  <p className={cn("text-sm font-bold", picked === cur.correctIndex ? "text-emerald-600" : "text-rose-600")}>{picked === cur.correctIndex ? "Correct!" : "Not quite."}</p>
                  {cur.explanation && <MarkdownRenderer content={cur.explanation} className="text-xs" localized />}
                  <Button size="sm" onClick={() => { setPicked(null); setQ((n) => n + 1); }}>{q + 1 >= qs.length ? "See my score" : "Next question"}</Button>
                </div>
              )}
            </>
          )}
        </Card>
      )}
    </Shell>
  );
}
