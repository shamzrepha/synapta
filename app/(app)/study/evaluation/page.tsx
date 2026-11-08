"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { fetchJson, asArray } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface Plan {
  title: string;
  action: string;
  topic: string;
  tool: string;
  minutes: number;
  href: string;
}
interface Evaluation {
  headline: string;
  strengths: string[];
  gaps: Array<{ topic: string; misunderstanding: string; severity: number }>;
  plan: Plan[];
  encouragement: string;
}
interface State {
  enough: boolean;
  stats?: { openMistakes: number; topicsTracked: number; fixed: number };
  evaluation: Evaluation | null;
  generatedAt?: string | null;
  stale: boolean;
  usedAi?: boolean;
}

const TOOL_LABEL: Record<string, string> = { retest: "Redo my wrong answers", flashcards: "Open flashcards", notes: "Make notes", lesson: "Open the lesson", quiz: "Take a quiz", tutor: "Ask the tutor" };
const SEVERITY = ["", "Worth a look", "Needs work", "Urgent"];
const SEVERITY_STYLE = ["", "bg-sky-500/15 text-sky-700 dark:text-sky-300", "bg-amber-500/20 text-amber-700 dark:text-amber-300", "bg-rose-500/20 text-rose-700 dark:text-rose-300"];

export default function EvaluationPage() {
  const { toast } = useToast();
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const j = await fetchJson<State>("/api/study/evaluation");
    if (j.ok) setS(j.data);
    else toast({ title: "Couldn't load your evaluation", description: j.error.message, variant: "destructive" });
  }, [toast]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const run = async (force: boolean) => {
    setBusy(true);
    const j = await fetchJson<State>("/api/study/evaluation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force }) });
    setBusy(false);
    if (j.ok) setS((prev) => ({ ...(prev || { stale: false, enough: true, evaluation: null }), ...j.data }));
    else toast({ title: "Couldn't make your evaluation", description: j.error.message, variant: "destructive" });
  };

  if (!s) return <Skeleton className="h-80 rounded-2xl" />;
  const ev = s.evaluation;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-mono tracking-widest text-brand-600">EVALUATION</p>
        <h1 className="text-2xl font-extrabold">How am I doing?</h1>
        <p className="text-sm text-slate-500 max-w-2xl">Sunroot looks at the questions you got wrong and your score on each topic, finds what you may be misunderstanding, and gives you a short plan.</p>
      </div>

      {!s.enough && (
        <Card className="p-6 space-y-2 text-sm">
          <p className="font-bold">Not enough to go on yet</p>
          <p className="text-slate-500">Answer some quiz questions in a class first. Your wrong answers and topic scores are what the evaluation is based on.</p>
          <Link href="/classes/manage" className="inline-block font-semibold text-brand-700 dark:text-brand-300 underline">Go to my classes</Link>
        </Card>
      )}

      {s.enough && !ev && (
        <Card className="p-6 space-y-3">
          <p className="text-sm">
            {s.stats ? `${s.stats.openMistakes} wrong answer${s.stats.openMistakes === 1 ? "" : "s"} to work on, ${s.stats.topicsTracked} topic${s.stats.topicsTracked === 1 ? "" : "s"} scored.` : "Ready when you are."}
          </p>
          <Button disabled={busy} onClick={() => run(false)}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />} Evaluate me
          </Button>
        </Card>
      )}

      {ev && (
        <>
          {s.stale && (
            <Card className="p-3 flex flex-wrap items-center gap-2 text-xs border-amber-500/40 bg-amber-500/5">
              <span className="flex-1">You&apos;ve answered more questions since this was made.</span>
              <Button size="sm" disabled={busy} onClick={() => run(false)}>{busy ? "Updating…" : "Update it"}</Button>
            </Card>
          )}

          <Card className="p-5 space-y-1">
            <p className="text-lg font-extrabold leading-snug">{ev.headline}</p>
            <p className="text-sm text-slate-500">{ev.encouragement}</p>
          </Card>

          {ev.strengths.length > 0 && (
            <Card className="p-4 space-y-2">
              <p className="font-bold text-sm">What&apos;s going well</p>
              <ul className="space-y-1 text-sm">
                {ev.strengths.map((t) => (
                  <li key={t} className="flex gap-2"><span aria-hidden>✅</span> {t}</li>
                ))}
              </ul>
            </Card>
          )}

          {ev.gaps.length > 0 && (
            <Card className="p-4 space-y-3">
              <p className="font-bold text-sm">Where you&apos;re stuck</p>
              <ul className="space-y-3">
                {asArray<Evaluation["gaps"][number]>(ev.gaps).map((g) => (
                  <li key={g.topic} className="space-y-0.5">
                    <p className="text-sm font-semibold flex flex-wrap items-center gap-2">
                      {g.topic} <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", SEVERITY_STYLE[g.severity])}>{SEVERITY[g.severity]}</span>
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{g.misunderstanding}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-4 space-y-3">
            <p className="font-bold text-sm">Your plan</p>
            <ol className="space-y-3">
              {asArray<Plan>(ev.plan).map((p, i) => (
                <li key={`${p.title}-${i}`} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{i + 1}</span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-semibold">{p.title} <span className="font-normal text-slate-500">· about {p.minutes} min</span></p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{p.action}</p>
                    <Link href={p.href} className="inline-block rounded-full border border-brand-600 px-3 py-1 text-xs font-bold text-brand-700 dark:text-brand-300 hover:bg-brand-500/10">{TOOL_LABEL[p.tool] || "Open"} →</Link>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            {s.generatedAt && <span>Made {new Date(s.generatedAt).toLocaleString()}.</span>}
            <button type="button" disabled={busy} onClick={() => run(true)} className="inline-flex items-center gap-1 font-semibold text-brand-700 dark:text-brand-300 underline disabled:opacity-50">
              <RefreshCw className="h-3 w-3" /> Make it again
            </button>
          </div>
        </>
      )}
    </div>
  );
}
