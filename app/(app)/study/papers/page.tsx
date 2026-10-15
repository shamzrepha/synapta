"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, ArrowLeft, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { PaperAttempt, PaperReview, type PaperData } from "@/components/papers/paper-attempt";
import { TopicPicker, topicPayload, topicReady, type TopicChoice } from "@/components/study/topic-picker";
import { asArray } from "@/lib/api/client";
import { weakTopicReport, type PaperResult, type TopicScore } from "@/lib/papers/logic";
import { cn } from "@/lib/utils";

interface HistoryItem {
  id: string;
  title: string;
  topic: string;
  minutes: number;
  createdAt: string;
  submittedAt: string | null;
  score: number | null;
  total: number | null;
  topics: TopicScore[];
}

type View =
  | { kind: "home" }
  | { kind: "attempt"; paper: PaperData }
  | { kind: "review"; paper: Pick<PaperData, "title" | "questions">; result: PaperResult };

const COUNTS = [5, 8, 10, 12];
const MINUTES = [10, 20, 30, 45, 60];

export default function PapersPage() {
  const { toast } = useToast();
  const [view, setView] = useState<View>({ kind: "home" });
  const [topic, setTopic] = useState<TopicChoice>({ text: "", classId: "", kcId: "" });
  const [count, setCount] = useState(8);
  const [minutes, setMinutes] = useState(30);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const loadHistory = useCallback(() => {
    fetch("/api/papers")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setHistory(asArray<HistoryItem>(j.data));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(loadHistory, 0);
    return () => clearTimeout(t);
  }, [loadHistory]);

  const start = async () => {
    if (busy || !topicReady(topic)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...topicPayload(topic), count, minutes }),
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error?.message || "Couldn't build a paper. Please try again.");
      setView({ kind: "attempt", paper: j.data as PaperData });
    } catch (e) {
      toast({ title: "Couldn't start", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const open = async (h: HistoryItem) => {
    try {
      const j = await fetch(`/api/papers/${h.id}`).then((r) => r.json());
      if (!j.ok) throw new Error(j.error?.message);
      if (j.data.result) setView({ kind: "review", paper: j.data, result: j.data.result });
      else toast({ title: "That attempt was never submitted", variant: "amber" });
    } catch {
      toast({ title: "Couldn't open that paper", variant: "destructive" });
    }
  };

  const onSubmitted = useCallback(
    (paper: PaperData) => (result: PaperResult) => {
      setView({ kind: "review", paper, result });
      loadHistory();
    },
    [loadHistory]
  );

  if (view.kind === "attempt") {
    return (
      <div className="max-w-3xl mx-auto">
        <PaperAttempt paper={view.paper} onSubmitted={onSubmitted(view.paper)} />
      </div>
    );
  }

  if (view.kind === "review") {
    return (
      <div className="max-w-3xl mx-auto space-y-3 pb-8">
        <button type="button" onClick={() => setView({ kind: "home" })} className="flex items-center gap-1 text-sm font-semibold text-teal-700 dark:text-teal-300 h-9">
          <ArrowLeft className="h-4 w-4" /> Papers
        </button>
        <PaperReview paper={view.paper} result={view.result} />
      </div>
    );
  }

  const submitted = history.filter((h) => h.submittedAt);
  const weak = weakTopicReport(submitted).slice(0, 6);

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-8">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Past-paper mode</h1>
        <p className="text-sm text-slate-500">A timed, AI-marked paper on any topic. It submits itself when time runs out.</p>
      </div>

      <Card className="p-4 space-y-4">
        <TopicPicker value={topic} onChange={setTopic} textPlaceholder="Which topic? e.g. “Newton’s laws of motion”, or paste your syllabus notes…" rows={3} />
        <div>
          <div className="text-xs font-semibold text-slate-500 mb-1.5">Questions</div>
          <div className="flex flex-wrap gap-2">
            {COUNTS.map((n) => (
              <Chip key={n} on={count === n} onClick={() => setCount(n)}>{n}</Chip>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500 mb-1.5">Time</div>
          <div className="flex flex-wrap gap-2">
            {MINUTES.map((n) => (
              <Chip key={n} on={minutes === n} onClick={() => setMinutes(n)}>{n} min</Chip>
            ))}
          </div>
        </div>
        <Button onClick={start} disabled={busy || !topicReady(topic)} size="lg" className="w-full">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Writing your paper…</> : "Start the paper"}
        </Button>
        <p className="text-[11px] text-slate-500">The clock starts as soon as the paper appears.</p>
      </Card>

      {weak.length > 0 && (
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-bold flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-amber-500" /> Weak-topic report</h2>
          {weak.map((t) => (
            <div key={t.topic}>
              <div className="flex justify-between text-xs"><span className="font-semibold">{t.topic}</span><span className="text-slate-500">{t.pct}% · {t.awarded}/{t.max}</span></div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className={cn("h-full rounded-full", t.weak ? "bg-rose-500" : "bg-teal-500")} style={{ width: `${t.pct}%` }} />
              </div>
            </div>
          ))}
        </Card>
      )}

      {history.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">History</h2>
          {history.map((h) => (
            <button key={h.id} type="button" onClick={() => open(h)} className="w-full text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-3 flex items-center gap-3 min-h-[56px]">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{h.title}</div>
                <div className="text-[11px] text-slate-500">{new Date(h.createdAt).toLocaleDateString()} · {h.minutes} min</div>
              </div>
              <div className="text-sm font-bold shrink-0">{h.score !== null ? `${h.score}/${h.total}` : <span className="text-xs text-slate-400">unfinished</span>}</div>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={cn("h-10 px-4 rounded-full border text-sm font-semibold", on ? "border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300" : "border-slate-200 dark:border-slate-800")}>
      {children}
    </button>
  );
}
