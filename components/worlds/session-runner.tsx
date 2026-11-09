"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { Flame, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Activity } from "@/lib/worlds/activities";
import { ActivityCard, type CardResult } from "./activity-card";
import { cn } from "@/lib/utils";

export interface SessionSummary {
  firstTry: number;
  total: number;
  xp: number;
  results: CardResult[];
}

/** Saves results to the server (memory cards, XP, lesson completion). Retries are practice: only first answers count. */
export async function saveResults(worldId: string, results: CardResult[], nodeId?: string): Promise<{ xpGained: number } | null> {
  try {
    const res = await fetch(`/api/worlds/${worldId}/progress`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nodeId, results: results.slice(0, 80) }) });
    const j = await res.json();
    return j.ok ? j.data : null;
  } catch {
    return null;
  }
}

interface Props {
  worldId: string;
  activities: Activity[];
  critical: string[];
  nodeId?: string;
  /** results already earned before this session (lecture checks), saved together at the end */
  before?: CardResult[];
  title: string;
  onExit: () => void;
  onFinished?: (s: SessionSummary) => void;
  finishLabel?: string;
  onFinishAction?: () => void;
  /** the lecture player draws its own frame */
  embedded?: boolean;
}

/** One activity at a time. A miss comes back once near the end (spec 16.3); the first answer is what the memory engine sees. */
export function SessionRunner({ worldId, activities, critical, nodeId, before = [], title, onExit, onFinished, finishLabel = "Done", onFinishAction, embedded }: Props) {
  const [queue, setQueue] = useState<Activity[]>(activities);
  const [firstAnswers, setFirstAnswers] = useState<CardResult[]>([]);
  const [requeued, setRequeued] = useState<string[]>([]);
  const [combo, setCombo] = useState(0);
  const [done, setDone] = useState<SessionSummary | null>(null);
  const saved = useRef(false);

  const total = activities.length;
  const solved = total - new Set(queue.map((q) => q.id)).size;
  const current = queue[0];

  const finish = useCallback(
    async (all: CardResult[]) => {
      if (saved.current) return;
      saved.current = true;
      const results = [...before, ...all];
      const r = await saveResults(worldId, results, nodeId);
      const firstTry = all.filter((x) => x.correct).length;
      const summary = { firstTry, total: all.length, xp: r?.xpGained ?? 0, results };
      setDone(summary);
      onFinished?.(summary);
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.55 } });
    },
    [before, worldId, nodeId, onFinished]
  );

  const next = (r: CardResult) => {
    const rest = queue.slice(1);
    const isRetry = requeued.includes(current.id);
    const answers = isRetry ? firstAnswers : [...firstAnswers, r];
    if (!isRetry) setFirstAnswers(answers);
    setCombo(r.correct ? (c) => c + 1 : 0);
    let q = rest;
    if (!r.correct && !isRetry) {
      q = [...rest, current];
      setRequeued((x) => [...x, current.id]);
    }
    setQueue(q);
    if (q.length === 0) void finish(answers);
  };

  useEffect(() => {
    if (embedded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onExit();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [embedded, onExit]);

  const stars = done ? (done.firstTry / Math.max(1, done.total) >= 0.9 ? 3 : done.firstTry / Math.max(1, done.total) >= 0.7 ? 2 : 1) : 0;
  const body = (
    <>
      <div className="flex items-center gap-3 px-3 py-3 max-w-xl w-full mx-auto">
        <button type="button" onClick={onExit} aria-label="Leave" className="h-10 w-10 shrink-0 rounded-lg hover:bg-muted flex items-center justify-center"><X className="h-5 w-5" /></button>
        <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done ? total : solved}>
          <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500" style={{ width: `${total ? ((done ? total : solved) / total) * 100 : 0}%` }} />
        </div>
        <span className={cn("flex items-center gap-1 text-sm font-bold tabular-nums", combo >= 2 ? "text-amber-600" : "text-muted-foreground")} aria-label={`${combo} in a row`}><Flame className="h-4 w-4" /> {combo}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl w-full mx-auto px-4 pb-8">
          {done ? (
            <div className="py-10 text-center space-y-5">
              <div className="flex justify-center gap-2" aria-label={`${stars} of 3 stars`}>
                {[1, 2, 3].map((n) => <Star key={n} className={cn("h-12 w-12", n <= stars ? "fill-amber-500 text-amber-500 scale-110" : "text-muted-foreground/40")} />)}
              </div>
              <h2 className="text-2xl font-extrabold">{title} done</h2>
              <div className="grid grid-cols-3 gap-2">
                {[{ v: `${done.firstTry}/${done.total}`, l: "First try" }, { v: `+${done.xp}`, l: "XP" }, { v: String(combo), l: "Streak" }].map((s) => (
                  <div key={s.l} className="rounded-lg border border-border bg-card py-3"><p className="text-xl font-bold tabular-nums">{s.v}</p><p className="text-[11px] text-muted-foreground">{s.l}</p></div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">What you missed is scheduled to come back, so it sticks.</p>
              <Button className="w-full h-12" onClick={onFinishAction ?? onExit}>{finishLabel}</Button>
            </div>
          ) : current ? (
            <div className="pt-2"><ActivityCard key={`${current.id}-${requeued.length}-${queue.length}`} worldId={worldId} activity={current} critical={critical.includes(current.kuIds[0])} onNext={next} /></div>
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">Nothing to practise right now.</p>
          )}
        </div>
      </div>
    </>
  );
  return embedded ? <div className="flex flex-col min-h-[70vh]">{body}</div> : <div className="fixed inset-0 z-[100] flex flex-col bg-background text-foreground pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" role="dialog" aria-modal="true" aria-label={title}>{body}</div>;
}
