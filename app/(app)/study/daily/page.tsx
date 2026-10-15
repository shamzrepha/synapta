"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Flame, Zap, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { api, errMsg, send } from "@/lib/study/client";
import { cn } from "@/lib/utils";

interface Q {
  question: string;
  options: string[];
  topic: string;
  answered: boolean;
  selectedIndex?: number;
  correct?: boolean;
  correctIndex?: number;
  explanation?: string;
}
interface Daily {
  day: string;
  origin: "mistakes" | "classes";
  completed: boolean;
  xp: number;
  correctCount: number;
  streak: number;
  bestStreak: number;
  questions: Q[];
}
interface Finished { xp: number; correct: number; total: number; streak: number }

export default function DailyPage() {
  const { toast } = useToast();
  const [data, setData] = useState<Daily | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    api<Daily>("/api/study/daily")
      .then((d) => alive && setData({ ...d, questions: asArray<Q>(d.questions) }))
      .catch((e) => alive && setError(errMsg(e)));
    return () => {
      alive = false;
    };
  }, []);

  const current = data ? data.questions.findIndex((q) => !q.answered) : -1;
  const allDone = !!data && current === -1;

  const answer = async (selectedIndex: number) => {
    if (!data || current < 0 || busy || picked !== null) return;
    setPicked(selectedIndex);
    setBusy(true);
    try {
      const r = await send<{ correct: boolean; correctIndex: number; explanation: string; finished: Finished | null }>("/api/study/daily/answer", { index: current, selectedIndex });
      setData((d) =>
        d && {
          ...d,
          questions: d.questions.map((q, i) => (i === current ? { ...q, answered: true, selectedIndex, correct: r.correct, correctIndex: r.correctIndex, explanation: r.explanation } : q)),
          correctCount: d.correctCount + (r.correct ? 1 : 0),
          ...(r.finished ? { completed: true, xp: r.finished.xp, streak: r.finished.streak, bestStreak: Math.max(d.bestStreak, r.finished.streak) } : {}),
        }
      );
      if (r.finished) setFinished(r.finished);
    } catch (e) {
      toast({ title: "Couldn't save your answer", description: errMsg(e), variant: "destructive" });
      setPicked(null);
    } finally {
      setBusy(false);
    }
  };

  // The question just answered stays on screen (with feedback) until the student taps Next.
  const [reviewIdx, setReviewIdx] = useState<number | null>(null);
  const shownIdx = reviewIdx ?? (current >= 0 ? current : data ? data.questions.length - 1 : 0);
  const q = data?.questions[shownIdx];

  const next = () => {
    setPicked(null);
    setReviewIdx(null);
  };

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2"><Zap className="h-7 w-7 text-amber-500" /> Daily 5</h1>
          <p className="text-sm text-slate-500">Five questions, about five minutes. {data?.origin === "mistakes" ? "Built from what you got wrong lately." : data ? "Built from your classes' topics." : ""}</p>
        </div>
        <div className={cn("rounded-2xl border px-3 py-2 text-center", data && data.streak > 0 ? "border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800" : "border-slate-200 dark:border-slate-800")}>
          <p className="flex items-center gap-1 text-lg font-extrabold tabular-nums"><Flame className={cn("h-5 w-5", data && data.streak > 0 ? "text-orange-500" : "text-slate-400")} />{data?.streak ?? 0}</p>
          <p className="text-[10px] text-slate-500">day streak</p>
        </div>
      </div>

      {!data && !error && <Skeleton className="h-72 w-full" />}
      {error && (
        <Card className="p-5 space-y-3 text-center">
          <p className="text-sm">{error}</p>
          <Link href="/classes" className="inline-block text-sm font-semibold text-teal-600">Browse classes</Link>
        </Card>
      )}

      {data && (
        <div className="flex gap-1.5" aria-label="Progress">
          {data.questions.map((x, i) => (
            <div key={i} className={cn("h-2 flex-1 rounded-full", x.answered ? (x.correct ? "bg-emerald-500" : "bg-rose-500") : i === shownIdx ? "bg-teal-400" : "bg-slate-200 dark:bg-slate-800")} />
          ))}
        </div>
      )}

      {data && allDone && picked === null && (
        <Card className="p-6 text-center space-y-3">
          <p className="text-4xl">{data.correctCount === data.questions.length ? "🏆" : "✅"}</p>
          <p className="text-xl font-extrabold">{data.completed ? "Today's challenge is done" : "All answered"}</p>
          <p className="text-sm text-slate-500">{data.correctCount} of {data.questions.length} correct · +{finished?.xp ?? data.xp} XP</p>
          <p className="text-sm font-semibold text-orange-600">{data.streak}-day streak · best {data.bestStreak}</p>
          {data.correctCount < data.questions.length && <Link href="/study/mistakes" className="inline-block text-sm font-semibold text-teal-600">Review your mistakes</Link>}
          <p className="text-xs text-slate-400">Come back tomorrow for a fresh set.</p>
        </Card>
      )}

      {data && q && (!allDone || picked !== null) && (
        <Card className="p-4 space-y-3">
          <p className="text-[11px] font-mono uppercase tracking-wide text-slate-400">Question {shownIdx + 1} of {data.questions.length}{q.topic ? ` · ${q.topic}` : ""}</p>
          <p className="font-semibold text-base break-words">{q.question}</p>
          <div className="space-y-2">
            {q.options.map((o, i) => {
              const done = q.answered;
              const isRight = done && i === q.correctIndex;
              const isWrong = done && i === q.selectedIndex && !q.correct;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={done || busy}
                  onClick={() => void answer(i)}
                  className={cn(
                    "w-full min-h-[48px] text-left rounded-xl border px-3 py-2.5 text-sm flex items-center gap-2 transition-colors",
                    !done && "border-slate-300 dark:border-slate-700 hover:border-teal-500 active:bg-teal-50 dark:active:bg-teal-950/30",
                    isRight && "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30",
                    isWrong && "border-rose-500 bg-rose-50 dark:bg-rose-950/30",
                    done && !isRight && !isWrong && "opacity-60"
                  )}
                >
                  <span className="flex-1 break-words">{o}</span>
                  {isRight && <Check className="h-4 w-4 text-emerald-600 shrink-0" />}
                  {isWrong && <X className="h-4 w-4 text-rose-600 shrink-0" />}
                </button>
              );
            })}
          </div>
          {q.answered && q.explanation && <p className="text-sm text-slate-600 dark:text-slate-300 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">{q.explanation}</p>}
          {q.answered && !allDone && <Button className="w-full" onClick={next}>Next question</Button>}
          {q.answered && allDone && <Button className="w-full" onClick={next}>See results</Button>}
        </Card>
      )}
    </div>
  );
}
