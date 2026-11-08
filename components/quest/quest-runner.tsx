"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { Check, CheckCircle2, Flame, GraduationCap, Lightbulb, Loader2, Star, X } from "lucide-react";
import { RichInline } from "@/components/markdown/rich-inline";
import { evaluate } from "@/lib/studio/expr";
import type { ClientChallenge } from "@/lib/quest/schema";
import { cn } from "@/lib/utils";

type Answer =
  | { type: "choose"; index: number }
  | { type: "number"; value: number }
  | { type: "slider"; x: number }
  | { type: "order"; order: string[] }
  | { type: "match"; pairs: Array<{ left: string; right: string }> };

interface Feedback {
  correct: boolean;
  explanation: string;
  hint?: string;
  solution?: string;
}

interface Props {
  classId: string;
  kcId: string;
  index: number;
  objective: string;
  onExit: () => void;
  /** called when the whole quest is finished; xp/mastery numbers come from the server */
  onFinished?: (r: { firstTry: number; total: number; pLAfter?: number; totalXp?: number; credited: boolean }) => void;
  onNextPiece?: () => void;
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Full-screen, one task at a time. Missed tasks come back at the end until they are solved. */
export function QuestRunner({ classId, kcId, index, objective, onExit, onFinished, onNextPiece }: Props) {
  const [challenges, setChallenges] = useState<ClientChallenge[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [checking, setChecking] = useState(false);
  const [points, setPoints] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [firstTry, setFirstTry] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<{ credited: boolean; pLAfter?: number; totalXp?: number; firstTry: number; total: number } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const attemptsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    let alive = true;
    fetch(`/api/classes/${classId}/kcs/${kcId}/quests?index=${index}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j.ok) return setError(j.error?.message || "Couldn't load the challenges.");
        setChallenges(j.data.challenges);
        setQueue(j.data.challenges.map((c: ClientChallenge) => c.id));
      })
      .catch(() => alive && setError("Couldn't load the challenges. Check your connection."));
    return () => {
      alive = false;
    };
  }, [classId, kcId, index]);

  const byId = useMemo(() => new Map((challenges || []).map((c) => [c.id, c])), [challenges]);
  const current = queue.length ? byId.get(queue[0]) : undefined;
  const total = challenges?.length || 0;
  const solved = total - new Set(queue).size;

  // a fresh task starts with an empty answer; order and match tasks reshuffle each time they appear
  const [shown, setShown] = useState<ClientChallenge | undefined>(undefined);
  useEffect(() => {
    const t = setTimeout(() => {
      setAnswer(null);
      setFeedback(null);
      if (!current) return setShown(undefined);
      if (current.type === "order") setShown({ ...current, items: shuffle(current.items) });
      else if (current.type === "match") setShown({ ...current, rights: shuffle(current.rights) });
      else setShown(current);
    }, 0);
    return () => clearTimeout(t);
  }, [current]);

  const finish = useCallback(async () => {
    setFinishing(true);
    try {
      const res = await fetch(`/api/classes/${classId}/kcs/${kcId}/quests/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index }),
      });
      const j = await res.json().catch(() => null);
      const d = j?.ok ? j.data : { credited: false, firstTry: Object.values(firstTry).filter(Boolean).length, total };
      setDone({ credited: !!d.credited, pLAfter: d.pLAfter, totalXp: d.totalXp, firstTry: Object.values(firstTry).filter(Boolean).length, total });
      onFinished?.({ firstTry: Object.values(firstTry).filter(Boolean).length, total, pLAfter: d.pLAfter, totalXp: d.totalXp, credited: !!d.credited });
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 } });
    } finally {
      setFinishing(false);
    }
  }, [classId, kcId, index, firstTry, total, onFinished]);

  const ready = useMemo(() => {
    if (!shown || !answer) return false;
    if (shown.type === "order") return answer.type === "order" && answer.order.length === shown.items.length;
    if (shown.type === "match") return answer.type === "match" && answer.pairs.length === shown.lefts.length;
    if (shown.type === "number") return answer.type === "number" && Number.isFinite(answer.value);
    return true;
  }, [shown, answer]);

  const check = async () => {
    if (!shown || !answer || checking) return;
    setChecking(true);
    try {
      const res = await fetch(`/api/classes/${classId}/kcs/${kcId}/quests/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index, challengeId: shown.id, answer }),
      });
      const j = await res.json();
      if (!j.ok) return setFeedback({ correct: false, explanation: j.error?.message || "Couldn't check that. Try again." });
      const attempts = (attemptsRef.current[shown.id] = (attemptsRef.current[shown.id] || 0) + 1);
      if (j.data.correct) {
        setCombo((c) => {
          const n = c + 1;
          setBestCombo((b) => Math.max(b, n));
          return n;
        });
        setPoints((p) => p + (attempts === 1 ? 10 : 5) + Math.min(combo, 5));
        confetti({ particleCount: 35, spread: 55, origin: { y: 0.85 }, scalar: 0.7 });
      } else setCombo(0);
      setFirstTry((f) => (shown.id in f ? f : { ...f, [shown.id]: !!j.data.correct }));
      setFeedback(j.data);
    } finally {
      setChecking(false);
    }
  };

  const next = () => {
    if (!feedback || !shown) return;
    const rest = queue.slice(1);
    // a miss comes back at the end, so it is practised until it is solved
    const q = feedback.correct ? rest : [...rest, shown.id];
    setQueue(q);
    if (q.length === 0) void finish();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
      if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        if (feedback) next();
        else if (ready) void check();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const stars = done ? (done.firstTry / Math.max(1, done.total) >= 0.9 ? 3 : done.firstTry / Math.max(1, done.total) >= 0.7 ? 2 : 1) : 0;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background text-foreground pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" role="dialog" aria-modal="true" aria-label="Quest">
      <div className="flex items-center gap-3 px-3 py-3 max-w-xl w-full mx-auto">
        <button type="button" onClick={onExit} aria-label="Leave quest" className="h-10 w-10 shrink-0 rounded-lg hover:bg-muted flex items-center justify-center">
          <X className="h-5 w-5" />
        </button>
        <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done ? total : solved}>
          <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ width: `${total ? ((done ? total : solved) / total) * 100 : 0}%` }} />
        </div>
        <span className={cn("flex items-center gap-1 text-sm font-bold tabular-nums", combo >= 2 ? "text-amber-600" : "text-muted-foreground")} aria-label={`${combo} in a row`}>
          <Flame className="h-4 w-4" /> {combo}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl w-full mx-auto px-4 pb-6">
          {error ? (
            <p className="py-16 text-center text-sm text-muted-foreground">{error}</p>
          ) : !challenges ? (
            <div className="py-16 flex justify-center" role="status"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : done ? (
            <div className="py-10 text-center space-y-5">
              <div className="flex justify-center gap-2" aria-label={`${stars} of 3 stars`}>
                {[1, 2, 3].map((n) => (
                  <Star key={n} className={cn("h-12 w-12 transition-all", n <= stars ? "fill-amber-500 text-amber-500 scale-110" : "text-muted-foreground/40")} />
                ))}
              </div>
              <h2 className="text-2xl font-extrabold">Piece complete</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto"><RichInline text={objective} /></p>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { v: `${done.firstTry}/${done.total}`, l: "First try" },
                  { v: String(points), l: "Points" },
                  { v: String(bestCombo), l: "Best streak" },
                ].map((s) => (
                  <div key={s.l} className="rounded-lg border border-border bg-card py-3">
                    <p className="text-xl font-bold tabular-nums">{s.v}</p>
                    <p className="text-[11px] text-muted-foreground">{s.l}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {done.credited ? "Your mastery for this topic was updated." : "Practice done. Mastery credit for this topic is limited to once every 10 minutes."}
              </p>
            </div>
          ) : shown ? (
            <div className="space-y-5 pt-2">
              <div className="flex items-start gap-3">
                <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white"><GraduationCap className="h-5 w-5" /></span>
                <div className="rounded-xl border border-border bg-card px-4 py-3 text-base leading-snug shadow-sm">
                  <RichInline text={shown.prompt} />
                </div>
              </div>
              <Widget c={shown} answer={answer} setAnswer={setAnswer} locked={!!feedback} />
            </div>
          ) : null}
        </div>
      </div>

      <div className={cn("border-t border-border", feedback ? (feedback.correct ? "bg-teal-500/10" : "bg-orange-500/10 cell-hatch") : "bg-background")}>
        <div className="max-w-xl w-full mx-auto px-4 py-3 space-y-3">
          {feedback && (
            <div className="space-y-1 text-sm" role="status" aria-live="polite">
              <p className={cn("flex items-center gap-2 text-base font-bold", feedback.correct ? "text-teal-700 dark:text-teal-300" : "text-orange-700 dark:text-orange-300")}>
                {feedback.correct ? <CheckCircle2 className="h-5 w-5" /> : <X className="h-5 w-5" />}
                {feedback.correct ? ["Nice!", "Exactly.", "Correct.", "Well done."][Math.min(combo, 4) % 4] : "Not quite. This one comes back later."}
              </p>
              {!feedback.correct && feedback.solution && <p><span className="font-semibold">Answer: </span><RichInline text={feedback.solution} /></p>}
              {!feedback.correct && feedback.hint && (
                <p className="flex items-start gap-1.5 text-muted-foreground"><Lightbulb className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" /><RichInline text={feedback.hint} /></p>
              )}
              <p className="text-muted-foreground"><RichInline text={feedback.explanation} /></p>
            </div>
          )}
          {done ? (
            <div className="flex gap-2">
              <button type="button" onClick={onExit} className="flex-1 h-12 rounded-lg border border-border font-semibold">Back to pieces</button>
              {onNextPiece && <button type="button" onClick={onNextPiece} className="flex-1 h-12 rounded-lg bg-brand-600 text-white font-bold">Next piece</button>}
            </div>
          ) : feedback ? (
            <button type="button" onClick={next} disabled={finishing} className={cn("w-full h-12 rounded-lg font-bold text-white", feedback.correct ? "bg-teal-600" : "bg-orange-600")}>
              {finishing ? "Saving…" : "Continue"}
            </button>
          ) : (
            <button type="button" onClick={check} disabled={!ready || checking} className="w-full h-12 rounded-lg bg-brand-600 text-white font-bold disabled:opacity-40">
              {checking ? "Checking…" : "Check"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Widget({ c, answer, setAnswer, locked }: { c: ClientChallenge; answer: Answer | null; setAnswer: (a: Answer | null) => void; locked: boolean }) {
  if (c.type === "choose") {
    const sel = answer?.type === "choose" ? answer.index : -1;
    return (
      <div className="grid gap-2">
        {c.options.map((o, i) => (
          <button
            key={i}
            type="button"
            disabled={locked}
            onClick={() => setAnswer({ type: "choose", index: i })}
            className={cn("text-left rounded-lg border-2 px-4 py-3 text-base min-h-14 transition-colors", sel === i ? "border-brand-600 bg-brand-500/10" : "border-border bg-card hover:border-brand-500/50")}
          >
            <span className="mr-3 inline-flex h-6 w-6 items-center justify-center rounded border border-border text-xs font-bold">{i + 1}</span>
            <RichInline text={o} />
          </button>
        ))}
      </div>
    );
  }
  if (c.type === "number") {
    return (
      <div className="flex items-center gap-3">
        <input
          type="text"
          inputMode="decimal"
          disabled={locked}
          autoFocus
          aria-label="Your answer"
          placeholder="Type a number"
          onChange={(e) => {
            const v = parseFloat(e.target.value.replace(",", "."));
            setAnswer(Number.isFinite(v) ? { type: "number", value: v } : null);
          }}
          className="h-14 flex-1 rounded-lg border-2 border-border bg-card px-4 text-xl font-semibold tabular-nums focus:border-brand-600 outline-none"
        />
        {c.unit && <span className="text-lg text-muted-foreground">{c.unit}</span>}
      </div>
    );
  }
  if (c.type === "slider") return <SliderWidget c={c} setAnswer={setAnswer} locked={locked} />;
  if (c.type === "order") return <OrderWidget c={c} answer={answer} setAnswer={setAnswer} locked={locked} />;
  return <MatchWidget c={c} answer={answer} setAnswer={setAnswer} locked={locked} />;
}

function SliderWidget({ c, setAnswer, locked }: { c: Extract<ClientChallenge, { type: "slider" }>; setAnswer: (a: Answer | null) => void; locked: boolean }) {
  const [x, setX] = useState(c.start);
  useEffect(() => {
    setAnswer({ type: "slider", x: c.start });
  }, [c, setAnswer]);
  const y = useMemo(() => {
    try {
      return evaluate(c.expr, { x });
    } catch {
      return NaN;
    }
  }, [c.expr, x]);
  // the bar scale covers every value the slider can produce, so the goal zone and the marker always fit
  const [lo, hi] = useMemo(() => {
    let a = Math.min(c.goalMin, c.goalMax);
    let b = Math.max(c.goalMin, c.goalMax);
    for (let i = 0; i <= 40; i++) {
      try {
        const v = evaluate(c.expr, { x: c.min + ((c.max - c.min) * i) / 40 });
        if (Number.isFinite(v)) {
          a = Math.min(a, v);
          b = Math.max(b, v);
        }
      } catch {}
    }
    return [a, b === a ? a + 1 : b];
  }, [c]);
  const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
  const inGoal = Number.isFinite(y) && y >= c.goalMin && y <= c.goalMax;
  const fmt = (v: number) => (Number.isFinite(v) ? Number(v.toPrecision(4)).toString() : "—");
  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-4">
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">{c.label}</span>
          <span className="text-2xl font-bold tabular-nums">{fmt(x)} <span className="text-sm font-medium text-muted-foreground">{c.unit}</span></span>
        </div>
        <input
          type="range"
          min={c.min}
          max={c.max}
          step={c.step}
          value={x}
          disabled={locked}
          aria-label={c.label}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            setX(v);
            setAnswer({ type: "slider", x: v });
          }}
          className="mt-2 w-full h-10 accent-[var(--color-brand-600,#3552E0)] touch-pan-y"
        />
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">{c.outLabel}</span>
          <span className={cn("text-2xl font-bold tabular-nums", inGoal ? "text-teal-600" : "")}>{fmt(y)} <span className="text-sm font-medium text-muted-foreground">{c.outUnit}</span></span>
        </div>
        <div className="relative mt-3 h-6 rounded-full bg-muted" aria-hidden="true">
          <div className="absolute inset-y-0 rounded-full bg-amber-500/30 border border-amber-500/70" style={{ left: pct(c.goalMin), width: `calc(${pct(c.goalMax)} - ${pct(c.goalMin)})`, minWidth: 28 }} />
          {Number.isFinite(y) && (
            <div className={cn("absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-background shadow transition-[left] duration-150", inGoal ? "bg-teal-500" : "bg-brand-600")} style={{ left: pct(y) }} />
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Goal: {fmt(c.goalMin)} to {fmt(c.goalMax)} {c.outUnit}</p>
      </div>
    </div>
  );
}

function OrderWidget({ c, answer, setAnswer, locked }: { c: Extract<ClientChallenge, { type: "order" }>; answer: Answer | null; setAnswer: (a: Answer | null) => void; locked: boolean }) {
  const chosen = answer?.type === "order" ? answer.order : [];
  const rest = c.items.filter((it) => !chosen.includes(it));
  return (
    <div className="space-y-4">
      <ol className="space-y-2 min-h-14" aria-label="Your order">
        {c.items.map((_, i) => {
          const it = chosen[i];
          return (
            <li key={i}>
              <button
                type="button"
                disabled={locked || !it}
                onClick={() => setAnswer({ type: "order", order: chosen.filter((_, j) => j !== i) })}
                className={cn("flex w-full items-center gap-3 rounded-lg border-2 px-3 py-3 text-left text-base min-h-14", it ? "border-brand-600 bg-brand-500/10" : "border-dashed border-border text-muted-foreground")}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">{i + 1}</span>
                {it ? <RichInline text={it} /> : <span className="text-sm">Tap an item below</span>}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-2" aria-label="Items to place">
        {rest.map((it) => (
          <button
            key={it}
            type="button"
            disabled={locked}
            onClick={() => setAnswer({ type: "order", order: [...chosen, it] })}
            className="rounded-lg border-2 border-border bg-card px-3 py-2.5 text-left text-sm hover:border-brand-500/60 min-h-11"
          >
            <RichInline text={it} />
          </button>
        ))}
      </div>
    </div>
  );
}

function MatchWidget({ c, answer, setAnswer, locked }: { c: Extract<ClientChallenge, { type: "match" }>; answer: Answer | null; setAnswer: (a: Answer | null) => void; locked: boolean }) {
  const pairs = answer?.type === "match" ? answer.pairs : [];
  const [left, setLeft] = useState<string | null>(null);
  const rightOf = (l: string) => pairs.find((p) => p.left === l)?.right;
  const usedRight = new Set(pairs.map((p) => p.right));
  const num = (l: string) => c.lefts.indexOf(l) + 1;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">
        {c.lefts.map((l) => {
          const paired = rightOf(l);
          return (
            <button
              key={l}
              type="button"
              disabled={locked}
              onClick={() => {
                if (paired) return setAnswer({ type: "match", pairs: pairs.filter((p) => p.left !== l) });
                setLeft(left === l ? null : l);
              }}
              className={cn("w-full rounded-lg border-2 px-3 py-3 text-left text-sm min-h-14", left === l ? "border-brand-600 bg-brand-500/15" : paired ? "border-brand-600/60 bg-brand-500/10" : "border-border bg-card")}
            >
              {paired && <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">{num(l)}</span>}
              <RichInline text={l} />
            </button>
          );
        })}
      </div>
      <div className="space-y-2">
        {c.rights.map((r) => {
          const owner = pairs.find((p) => p.right === r)?.left;
          return (
            <button
              key={r}
              type="button"
              disabled={locked}
              onClick={() => {
                if (owner) return setAnswer({ type: "match", pairs: pairs.filter((p) => p.right !== r) });
                if (!left) return;
                setAnswer({ type: "match", pairs: [...pairs, { left, right: r }] });
                setLeft(null);
              }}
              className={cn("w-full rounded-lg border-2 px-3 py-3 text-left text-sm min-h-14", owner ? "border-brand-600/60 bg-brand-500/10" : usedRight.has(r) ? "opacity-50" : "border-border bg-card hover:border-brand-500/50")}
            >
              {owner && <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white"><Check className="h-3 w-3" />{""}</span>}
              <RichInline text={r} />
            </button>
          );
        })}
      </div>
      <p className="col-span-2 text-xs text-muted-foreground">Tap an item on the left, then its match on the right. Tap a pair to undo it.</p>
    </div>
  );
}
