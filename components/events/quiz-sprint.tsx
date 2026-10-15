"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { Flame, Zap, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface Question {
  index: number;
  total: number;
  question: string;
  options: string[];
  limitMs: number;
  remainingMs: number;
}

interface Feedback {
  correct: boolean;
  late: boolean;
  points: number;
  streak: number;
  totalScore: number;
  correctIndex: number;
  explanation: string;
  finished: boolean;
  choice: number;
}

const TILE = [
  "bg-rose-500 hover:bg-rose-600",
  "bg-sky-500 hover:bg-sky-600",
  "bg-amber-500 hover:bg-amber-600",
  "bg-emerald-500 hover:bg-emerald-600",
  "bg-purple-500 hover:bg-purple-600",
  "bg-orange-500 hover:bg-orange-600",
];
const SHAPES = ["▲", "◆", "●", "■", "★", "⬟"];

/** Kahoot-style player: server-timed questions, speed points, streak bonus, instant feedback. */
export function QuizSprintPlayer({ eventId, onProgress }: { eventId: string; onProgress: () => void }) {
  const { toast } = useToast();
  const [q, setQ] = useState<Question | null>(null);
  const [deadline, setDeadline] = useState<number>(0);
  const [now, setNow] = useState(() => Date.now());
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const answeredRef = useRef(false);

  const loadNext = useCallback(async () => {
    setFeedback(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/events/${eventId}/next`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        toast({ title: "Can't load the question", description: data.error?.message, variant: "destructive" });
        return;
      }
      if (data.data.done) {
        setDone(true);
        setQ(null);
        onProgress();
        return;
      }
      answeredRef.current = false;
      setQ(data.data);
      setDeadline(Date.now() + data.data.remainingMs);
    } finally {
      setBusy(false);
    }
  }, [eventId, onProgress, toast]);

  const answer = useCallback(
    async (choice: number) => {
      if (!q || answeredRef.current) return;
      answeredRef.current = true;
      setBusy(true);
      try {
        const res = await fetch(`/api/events/${eventId}/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ index: q.index, choice }),
        });
        const data = await res.json();
        if (!data.ok) {
          toast({ title: "Answer not recorded", description: data.error?.message, variant: "destructive" });
          answeredRef.current = false;
          return;
        }
        setFeedback({ ...data.data, choice });
        if (data.data.correct && data.data.streak >= 3) confetti({ particleCount: 50, spread: 50, origin: { y: 0.7 } });
        onProgress();
      } finally {
        setBusy(false);
      }
    },
    [q, eventId, onProgress, toast]
  );

  // Countdown tick + auto-submit "no answer" at zero
  useEffect(() => {
    if (!q || feedback) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= deadline && !answeredRef.current) answer(-1);
    }, 100);
    return () => clearInterval(t);
  }, [q, feedback, deadline, answer]);

  // Keyboard 1-4
  useEffect(() => {
    if (!q || feedback) return;
    const onKey = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1;
      if (i >= 0 && i < q.options.length) answer(i);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [q, feedback, answer]);

  if (done) {
    return (
      <div className="text-center py-10 space-y-2">
        <p className="text-5xl">🏁</p>
        <p className="text-xl font-extrabold">You&apos;re done!</p>
        <p className="text-sm text-slate-500">Watch the live leaderboard — results and XP are awarded when the sprint ends.</p>
      </div>
    );
  }

  if (!q) {
    return (
      <div className="text-center py-10 space-y-4">
        <p className="text-5xl">⚡</p>
        <p className="font-bold text-lg">Ready?</p>
        <p className="text-sm text-slate-500 max-w-sm mx-auto">Faster correct answers score more (up to 1,000 points). Get several in a row for a streak bonus.</p>
        <Button size="lg" onClick={loadNext} isLoading={busy}>
          Start
        </Button>
      </div>
    );
  }

  const remaining = Math.max(0, deadline - now);
  const pct = (remaining / q.limitMs) * 100;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span>
          Question {q.index + 1}/{q.total}
        </span>
        <span className={cn("flex items-center gap-1 tabular-nums", remaining < 5000 && !feedback && "text-rose-600 animate-pulse")}>
          <Clock className="h-4 w-4" /> {feedback ? "—" : `${Math.ceil(remaining / 1000)}s`}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
        <div
          className={cn("h-full transition-[width] duration-100", pct > 50 ? "bg-emerald-500" : pct > 20 ? "bg-amber-500" : "bg-rose-500")}
          style={{ width: `${feedback ? 0 : pct}%` }}
        />
      </div>

      <div className="rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 min-h-[90px] flex items-center justify-center text-center">
        <MarkdownRenderer content={q.question} className="text-base sm:text-lg font-semibold prose-p:my-0" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {q.options.map((opt, i) => {
          const isCorrect = feedback && i === feedback.correctIndex;
          const isPicked = feedback && i === feedback.choice;
          return (
            <button
              key={i}
              type="button"
              disabled={!!feedback || busy}
              onClick={() => answer(i)}
              className={cn(
                "relative min-h-[64px] rounded-2xl px-4 py-3 text-left text-white font-semibold shadow-md transition-all flex items-center gap-3 active:scale-[0.98]",
                TILE[i % TILE.length],
                feedback && !isCorrect && "opacity-40",
                isCorrect && "ring-4 ring-white dark:ring-slate-950 scale-[1.02]"
              )}
            >
              <span className="text-xl opacity-90">{SHAPES[i % SHAPES.length]}</span>
              <span className="flex-1 min-w-0 [&_*]:text-white">
                <MarkdownRenderer content={opt} className="prose-p:my-0 text-sm sm:text-base text-white" />
              </span>
              {isCorrect && <CheckCircle2 className="h-6 w-6 shrink-0" />}
              {isPicked && !isCorrect && <XCircle className="h-6 w-6 shrink-0" />}
            </button>
          );
        })}
      </div>

      {feedback && (
        <div
          className={cn(
            "rounded-2xl p-4 text-center space-y-2 border-2",
            feedback.correct ? "border-emerald-500 bg-emerald-500/10" : "border-rose-500 bg-rose-500/10"
          )}
        >
          <p className="text-2xl font-extrabold">
            {feedback.correct ? `+${feedback.points}` : feedback.late || feedback.choice === -1 ? "Time's up!" : "Not quite"}
          </p>
          {feedback.correct && feedback.streak >= 2 && (
            <p className="text-sm font-bold text-amber-600 flex items-center justify-center gap-1">
              <Flame className="h-4 w-4" /> {feedback.streak} in a row!
            </p>
          )}
          {feedback.explanation && <MarkdownRenderer content={feedback.explanation} className="prose-p:my-0 text-sm text-left" />}
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm font-semibold flex items-center gap-1">
              <Zap className="h-4 w-4 text-amber-500" /> {feedback.totalScore.toLocaleString()} pts
            </span>
            <Button size="sm" onClick={loadNext} isLoading={busy}>
              {feedback.finished ? "Finish" : "Next question"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
