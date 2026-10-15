"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Clock, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { formatClock, type PaperResult, type PublicQuestion } from "@/lib/papers/logic";
import { cn } from "@/lib/utils";

export interface PaperData {
  id: string;
  title: string;
  minutes: number;
  startedAt: string;
  total: number;
  questions: PublicQuestion[];
}

/** Timed attempt: countdown, answers, auto-submit at zero. */
export function PaperAttempt({ paper, onSubmitted }: { paper: PaperData; onSubmitted: (r: PaperResult) => void }) {
  const { toast } = useToast();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [left, setLeft] = useState(paper.minutes * 60);
  const [submitting, setSubmitting] = useState(false);
  const answersRef = useRef(answers);
  const doneRef = useRef(false);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const submit = useCallback(async () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/papers/${paper.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: answersRef.current }),
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error?.message || "Marking failed. Please try again.");
      onSubmitted(j.data.result as PaperResult);
    } catch (e) {
      doneRef.current = false;
      setSubmitting(false);
      toast({ title: "Couldn't submit", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  }, [paper.id, onSubmitted, toast]);

  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  useEffect(() => {
    const deadline = Date.parse(paper.startedAt) + paper.minutes * 60_000;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining <= 0) {
        clearInterval(id);
        submitRef.current();
      }
    };
    const id = setInterval(tick, 500);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, [paper.startedAt, paper.minutes]);

  const answered = paper.questions.filter((q) => (answers[q.id] || "").trim()).length;
  const urgent = left <= 60;

  return (
    <div className="space-y-3 pb-24">
      <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-white/95 dark:bg-slate-950/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold truncate">{paper.title}</div>
          <div className="text-[11px] text-slate-500">{answered}/{paper.questions.length} answered · {paper.total} marks</div>
        </div>
        <div className={cn("flex items-center gap-1.5 rounded-lg px-2.5 h-9 font-mono font-bold text-sm", urgent ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" : "bg-slate-100 dark:bg-slate-800")} aria-live="off">
          <Clock className="h-4 w-4" /> {formatClock(left)}
        </div>
      </div>

      {paper.questions.map((q, i) => (
        <Card key={q.id} className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-teal-600">Q{i + 1} · {q.topic}</div>
            <div className="text-[11px] font-semibold text-slate-500 shrink-0">[{q.marks} {q.marks === 1 ? "mark" : "marks"}]</div>
          </div>
          <MarkdownRenderer content={q.prompt} />
          {q.type === "mcq" ? (
            <div className="space-y-2" role="radiogroup">
              {q.options.map((o, oi) => {
                const on = answers[q.id] === String(oi);
                return (
                  <button
                    key={oi}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: String(oi) }))}
                    className={cn("w-full text-left rounded-xl border px-3 py-2.5 text-sm min-h-[44px]", on ? "border-teal-500 bg-teal-500/10 font-semibold" : "border-slate-200 dark:border-slate-800")}
                  >
                    <span className="font-bold mr-2">{String.fromCharCode(65 + oi)}.</span>
                    {o}
                  </button>
                );
              })}
            </div>
          ) : (
            <textarea
              value={answers[q.id] || ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              rows={4}
              maxLength={3000}
              placeholder="Write your answer…"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          )}
        </Card>
      ))}

      <div className="fixed bottom-0 inset-x-0 z-10 p-3 bg-white/95 dark:bg-slate-950/95 border-t border-slate-200 dark:border-slate-800 md:static md:border-0 md:bg-transparent md:p-0">
        <Button onClick={submit} disabled={submitting} size="lg" className="w-full max-w-3xl mx-auto flex">
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Marking…</> : "Submit paper"}
        </Button>
      </div>
    </div>
  );
}

/** Marked paper: score, per-question feedback and weak topics. */
export function PaperReview({ paper, result }: { paper: Pick<PaperData, "title" | "questions">; result: PaperResult }) {
  const pct = result.total ? Math.round((result.score / result.total) * 100) : 0;
  const byId = new Map(paper.questions.map((q) => [q.id, q]));
  return (
    <div className="space-y-3">
      <Card className="p-5 text-center">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{paper.title}</div>
        <div className="text-4xl font-extrabold mt-1">{result.score}<span className="text-xl text-slate-400"> / {result.total}</span></div>
        <div className="text-sm text-slate-500">{pct}%</div>
        {result.topics.length > 0 && (
          <div className="mt-4 space-y-2 text-left">
            {[...result.topics].sort((a, b) => a.awarded / a.max - b.awarded / b.max).map((t) => {
              const p = t.max ? Math.round((t.awarded / t.max) * 100) : 0;
              return (
                <div key={t.topic}>
                  <div className="flex justify-between text-xs"><span className="font-semibold">{t.topic}</span><span className="text-slate-500">{t.awarded}/{t.max}</span></div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className={cn("h-full rounded-full", p < 60 ? "bg-rose-500" : "bg-teal-500")} style={{ width: `${p}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      {result.perQuestion.map((r, i) => {
        const q = byId.get(r.id);
        const full = r.awarded >= r.max;
        return (
          <Card key={r.id} className="p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-teal-600">Q{i + 1} · {r.topic}</div>
              <div className={cn("flex items-center gap-1 text-xs font-bold", full ? "text-teal-600" : r.awarded > 0 ? "text-amber-600" : "text-rose-600")}>
                {full ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {r.awarded}/{r.max}
              </div>
            </div>
            {q && <MarkdownRenderer content={q.prompt} />}
            <div className="text-sm"><span className="font-semibold">Your answer: </span>{r.answer || <em className="text-slate-400">blank</em>}</div>
            <div className="text-sm rounded-lg bg-slate-50 dark:bg-slate-900 p-2.5">{r.feedback}</div>
            {!full && r.correctAnswer && (
              <div className="text-sm"><span className="font-semibold">Model answer: </span><MarkdownRenderer content={r.correctAnswer} className="inline" /></div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
