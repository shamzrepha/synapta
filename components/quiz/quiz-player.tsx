"use client";

import React, { useCallback, useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { CheckCircle2, XCircle, RotateCw, ArrowRight, Trophy, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  difficulty?: string;
}

interface AnswerResult {
  selected: number;
  correct: boolean;
  correctIndex: number;
  explanation: string;
}

export interface QuizPlayerProps {
  classId: string;
  kcId: string;
  onEvidence?: (update: { pLAfter?: number; totalXp?: number }) => void;
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const COUNTS = [5, 10, 15];
const FOCUSES: Array<{ key: "mixed" | "conceptual" | "calculation" | "application"; label: string }> = [
  { key: "mixed", label: "Mixed" },
  { key: "conceptual", label: "Concepts" },
  { key: "calculation", label: "Calculations" },
  { key: "application", label: "Real-world" },
];

export function QuizPlayer({ classId, kcId, onEvidence }: QuizPlayerProps) {
  const { toast } = useToast();
  const [count, setCount] = useState(10);
  const [focus, setFocus] = useState<(typeof FOCUSES)[number]["key"]>("mixed");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<Record<number, AnswerResult>>({});
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startQuiz = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, kcId, count, focus }),
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.data?.questions) && data.data.questions.length > 0) {
        setSessionId(data.data.sessionId);
        setQuestions(data.data.questions);
        setCurrent(0);
        setSelected(null);
        setResults({});
        setFinished(false);
      } else {
        setError(data.error?.message || "Couldn't generate a quiz right now. Please try again.");
      }
    } catch {
      setError("Network error while generating the quiz.");
    } finally {
      setLoading(false);
    }
  };

  const q = questions[current];
  const answered = q ? results[current] : undefined;

  const submit = useCallback(async () => {
    if (selected === null || !sessionId || answered || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/quiz/${sessionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionIndex: current, selectedOptionIndex: selected }),
      });
      const data = await res.json();
      if (!data.ok) {
        toast({ title: "Couldn't grade answer", description: data.error?.message, variant: "destructive" });
        return;
      }
      const d = data.data;
      setResults((prev) => ({
        ...prev,
        [current]: { selected, correct: !!d.correct, correctIndex: d.correctIndex, explanation: d.explanation || "" },
      }));
      onEvidence?.({ pLAfter: d.pLAfter, totalXp: d.totalXp });
      if (d.crossedMasteryFirstTime) {
        confetti({ particleCount: 140, spread: 75, origin: { y: 0.6 } });
        toast({ title: "Mastery achieved!", description: "You crossed 95% mastery. +100 bonus XP.", variant: "success" });
      }
    } catch {
      toast({ title: "Network error", description: "Your answer wasn't submitted.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }, [selected, sessionId, answered, submitting, current, onEvidence, toast]);

  const next = useCallback(() => {
    if (current < questions.length - 1) {
      setCurrent((c) => c + 1);
      setSelected(null);
    } else {
      setFinished(true);
      const correct = Object.values(results).filter((r) => r.correct).length;
      if (correct / Math.max(1, questions.length) >= 0.8) {
        confetti({ particleCount: 100, spread: 60, origin: { y: 0.7 } });
      }
    }
  }, [current, questions.length, results]);

  // Keyboard: 1-4 / A-D to pick, Enter to submit or continue
  useEffect(() => {
    if (!q || finished) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const k = e.key.toUpperCase();
      const numIdx = Number(k) - 1;
      const letterIdx = LETTERS.indexOf(k);
      const idx = !Number.isNaN(numIdx) && numIdx >= 0 ? numIdx : letterIdx;
      if (!answered && idx >= 0 && idx < q.options.length) {
        setSelected(idx);
      } else if (e.key === "Enter") {
        if (answered) next();
        else submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [q, answered, finished, next, submit]);

  // ---------- Setup screen ----------
  if (!loading && questions.length === 0) {
    return (
      <div className="py-6 space-y-5 max-w-lg mx-auto text-center">
        <div className="h-12 w-12 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center mx-auto">
          <HelpCircle className="h-6 w-6" />
        </div>
        <div>
          <h3 className="font-bold text-lg">Practice quiz</h3>
          <p className="text-xs text-slate-500 mt-1">
            Questions are generated from this topic&apos;s lesson and your teacher&apos;s materials. Every answer updates your mastery.
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Questions</p>
          <div className="flex justify-center gap-2">
            {COUNTS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCount(c)}
                className={cn(
                  "px-4 py-2 rounded-xl border text-sm font-semibold transition-all",
                  count === c
                    ? "border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300"
                    : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Focus</p>
          <div className="flex flex-wrap justify-center gap-2">
            {FOCUSES.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFocus(f.key)}
                className={cn(
                  "px-3 py-1.5 rounded-full border text-xs font-semibold transition-all",
                  focus === f.key
                    ? "border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300"
                    : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">{error}</p>
        )}
        <Button onClick={startQuiz} isLoading={loading} className="w-full sm:w-auto">
          Start quiz
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 py-4">
        <p className="text-xs text-slate-500 text-center">Writing and checking {count} questions…</p>
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    );
  }

  // ---------- Results screen ----------
  if (finished) {
    const total = questions.length;
    const correct = Object.values(results).filter((r) => r.correct).length;
    const pct = Math.round((correct / Math.max(1, total)) * 100);
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2 py-4">
          <Trophy className={cn("h-10 w-10 mx-auto", pct >= 80 ? "text-amber-500" : "text-slate-400")} />
          <h3 className="text-2xl font-extrabold">
            {correct} / {total} correct
          </h3>
          <p className="text-sm text-slate-500">
            {pct >= 80 ? "Excellent work — you really know this." : pct >= 50 ? "Good progress. Review the ones you missed below." : "Keep going — read the explanations, then try a fresh quiz."}
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <Button onClick={startQuiz} isLoading={loading}>
              <RotateCw className="h-4 w-4 mr-1.5" /> New quiz
            </Button>
            <Button variant="outline" onClick={() => setQuestions([])}>
              Change settings
            </Button>
          </div>
        </div>
        <div className="space-y-3">
          {questions.map((qq, i) => {
            const r = results[i];
            return (
              <div
                key={qq.id}
                className={cn(
                  "p-4 rounded-2xl border text-sm",
                  r?.correct
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : "border-rose-500/40 bg-rose-500/5"
                )}
              >
                <div className="flex gap-2 items-start">
                  {r?.correct ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-1 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-rose-500 mt-1 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0 space-y-2">
                    <MarkdownRenderer content={qq.question} className="prose-p:my-0 font-semibold" />
                    {r ? (
                      <div className="text-xs space-y-1">
                        {!r.correct && (
                          <div className="flex gap-1.5 items-baseline text-rose-700 dark:text-rose-300">
                            <span className="font-semibold shrink-0">Your answer:</span>
                            <MarkdownRenderer content={qq.options[r.selected]} className="prose-p:my-0 text-xs" />
                          </div>
                        )}
                        <div className="flex gap-1.5 items-baseline text-emerald-700 dark:text-emerald-300">
                          <span className="font-semibold shrink-0">Correct answer:</span>
                          <MarkdownRenderer content={qq.options[r.correctIndex]} className="prose-p:my-0 text-xs" />
                        </div>
                        {r.explanation && (
                          <MarkdownRenderer content={r.explanation} className="prose-p:my-0 text-xs text-slate-600 dark:text-slate-400" />
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">Skipped</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ---------- Question screen ----------
  const progress = ((current + (answered ? 1 : 0)) / questions.length) * 100;
  const score = Object.values(results).filter((r) => r.correct).length;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="font-semibold">
            Question {current + 1} of {questions.length}
          </span>
          <div className="flex items-center gap-2">
            {q.difficulty && (
              <Badge variant="outline" className="text-[10px] capitalize">
                {q.difficulty}
              </Badge>
            )}
            <span>
              Score: <strong className="text-slate-900 dark:text-slate-100">{score}</strong>
            </span>
          </div>
        </div>
        <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div className="h-full bg-teal-500 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 p-5">
        <MarkdownRenderer content={q.question} className="text-base font-semibold prose-p:my-1" />
      </div>

      <div className="space-y-2.5" role="radiogroup" aria-label="Answer options">
        {q.options.map((opt, idx) => {
          const isSelected = (answered ? answered.selected : selected) === idx;
          const isCorrect = answered && idx === answered.correctIndex;
          const isWrongPick = answered && isSelected && !answered.correct;
          return (
            <button
              key={idx}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={!!answered}
              onClick={() => setSelected(idx)}
              className={cn(
                "w-full text-left p-3.5 rounded-xl border-2 flex items-start gap-3 transition-all",
                answered
                  ? isCorrect
                    ? "border-emerald-500 bg-emerald-500/10"
                    : isWrongPick
                    ? "border-rose-500 bg-rose-500/10"
                    : "border-slate-200 dark:border-slate-800 opacity-60"
                  : isSelected
                  ? "border-teal-500 bg-teal-500/10 shadow-sm"
                  : "border-slate-200 dark:border-slate-800 hover:border-teal-400/60 hover:bg-slate-50 dark:hover:bg-slate-900"
              )}
            >
              <span
                className={cn(
                  "h-7 w-7 shrink-0 rounded-lg flex items-center justify-center text-xs font-bold",
                  answered && isCorrect
                    ? "bg-emerald-500 text-white"
                    : isWrongPick
                    ? "bg-rose-500 text-white"
                    : isSelected
                    ? "bg-teal-600 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                )}
              >
                {LETTERS[idx]}
              </span>
              <div className="flex-1 min-w-0 pt-0.5">
                <MarkdownRenderer content={opt} className="prose-p:my-0" />
              </div>
              {answered && isCorrect && <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />}
              {isWrongPick && <XCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />}
            </button>
          );
        })}
      </div>

      {answered && (
        <div
          className={cn(
            "p-4 rounded-xl border text-sm",
            answered.correct
              ? "border-emerald-500/40 bg-emerald-500/5"
              : "border-rose-500/40 bg-rose-500/5"
          )}
        >
          <p className="font-bold mb-1">{answered.correct ? "Correct!" : `Not quite — the answer is ${LETTERS[answered.correctIndex]}.`}</p>
          {answered.explanation && <MarkdownRenderer content={answered.explanation} className="prose-p:my-1 text-sm" />}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="hidden sm:block text-[11px] text-slate-400">Tip: press 1–4 to pick, Enter to continue</span>
        {!answered ? (
          <Button onClick={submit} disabled={selected === null} isLoading={submitting} className="ml-auto">
            Check answer
          </Button>
        ) : (
          <Button onClick={next} className="ml-auto">
            {current < questions.length - 1 ? (
              <>
                Next question <ArrowRight className="h-4 w-4 ml-1.5" />
              </>
            ) : (
              "See results"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
