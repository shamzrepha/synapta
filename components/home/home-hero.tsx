"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Play, RefreshCw, Sparkles, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { asArray } from "@/lib/api/client";
import { homeState, pickNextAction, type NextAction, type ProgressSummary } from "@/lib/home/next-action";

interface Next {
  classId: string;
  className: string;
  action: NextAction;
}

const KEY = "sunroot_how_it_works_hidden";

/** The one obvious thing to do next, plus a three-step "how it works" for newcomers. */
export function HomeHero({
  role,
  classes,
  loading,
  failed = false,
  offline = false,
  questsAllDone = false,
  progress,
  onRetry,
}: {
  role: string | undefined;
  classes: Array<{ id: string; title: string }>;
  loading: boolean;
  /** the dashboard request failed */
  failed?: boolean;
  offline?: boolean;
  questsAllDone?: boolean;
  progress?: ProgressSummary;
  onRetry?: () => void;
}) {
  const teacher = role === "teacher" || role === "admin";
  const first = asArray(classes)[0];
  const [next, setNext] = useState<Next | null>(null);
  const [hidden, setHidden] = useState(true); // hidden until we know it wasn't dismissed (no flash)

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setHidden(localStorage.getItem(KEY) === "1");
      } catch {
        setHidden(false);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // the first topic you haven't mastered yet, in the class you opened most recently
  useEffect(() => {
    if (teacher || !first) return;
    let alive = true;
    fetch(`/api/classes/${first.id}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j.ok) return;
        const kcs = asArray<{ id: string; title: string }>(j.data.kcs);
        const mastery = (j.data.masteryMap || {}) as Record<string, number>;
        setNext({ classId: first.id, className: first.title, action: pickNextAction(kcs, mastery) });
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [teacher, first]);

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* private mode: it will just show again next time */
    }
  };

  const state = homeState({ loading, failed, teacher, classCount: asArray(classes).length, questsAllDone });
  const btn = "bg-amber-500 text-slate-950 font-black shadow-md  transition-all  ";

  let eyebrow = "YOUR NEXT STEP";
  let headline = "Pick up right where you left off.";
  let primary: React.ReactNode = null;
  let note: React.ReactNode = null;

  if (state === "teacher") {
    eyebrow = "TEACH";
    headline = "Upload a syllabus or notes and let the AI map your class.";
    primary = (
      <Link href="/explore?create=1">
        <Button size="lg" className={btn}>
          <Sparkles className="h-5 w-5 mr-2 text-slate-950" /> Build a new class with AI
        </Button>
      </Link>
    );
  } else if (state === "error") {
    headline = offline ? "You're offline." : "We couldn't load your classes.";
    note = offline ? "Reconnect to see your progress. Lessons you saved for offline are still in My classes." : "This is on our side, nothing you did. Your progress is safe.";
    primary = (
      <div className="flex flex-wrap gap-2">
        <Button size="lg" className={btn} onClick={onRetry}>
          <RefreshCw className="h-5 w-5 mr-2" /> Try again
        </Button>
        <Link href="/classes/manage">
          <Button size="lg" variant="outline" className="border-border hover:bg-muted">
            Go to my classes
          </Button>
        </Link>
      </div>
    );
  } else if (state === "new") {
    headline = "Start by joining a class.";
    primary = (
      <Link href="/explore">
        <Button size="lg" className={btn}>
          <Sparkles className="h-5 w-5 mr-2 text-slate-950" /> Join or pick your first class
        </Button>
      </Link>
    );
  } else if (state === "returning" || state === "done-today") {
    const a = next?.action;
    if (state === "done-today") {
      eyebrow = "ALL DONE TODAY";
      headline = "Today's quests are done. Nice work.";
    }
    const href = !a || a.kind === "open-class" ? `/classes/${first.id}` : `/classes/${first.id}/topics/${a.kcId}`;
    const label = !a ? `Open ${first.title}` : a.kind === "continue" ? `${a.pct > 0 ? "Continue" : "Start"}: ${a.title}` : a.kind === "review" ? `Review: ${a.title}` : `Open ${first.title}`;
    if (a?.kind === "review" && state === "returning") headline = "You've got every topic down. Keep it fresh.";
    if (progress?.tracked) note = `${progress.mastered} of ${progress.tracked} topics mastered · average mastery ${progress.average}%`;
    primary = (
      <Link href={href}>
        <Button size="lg" className={btn}>
          <Play className="h-5 w-5 mr-2 text-slate-950 fill-slate-950" /> {label}
        </Button>
      </Link>
    );
    if (failed) note = "Couldn't refresh your progress just now, showing what we had.";
  }

  return (
    <div className="space-y-4">
      <div
        className="relative overflow-hidden rounded-3xl border border-teal-500/25 bg-card p-6 md:p-8 space-y-4 shadow-sm"
        aria-busy={state === "loading"}
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <p className="text-xs font-mono font-bold tracking-widest text-amber-600 dark:text-amber-400 uppercase">{eyebrow}</p>
        </div>

        {state === "loading" ? (
          <div className="space-y-3" role="status" aria-label="Loading your next step">
            <div className="h-7 w-3/4 rounded-lg bg-muted animate-pulse" />
            <div className="h-11 w-56 rounded-xl bg-muted animate-pulse" />
          </div>
        ) : (
          <>
            <h2 className="text-xl md:text-2xl font-black leading-tight flex items-center gap-2 text-foreground">
              {offline && state === "error" && <WifiOff className="h-6 w-6 shrink-0 text-amber-500" aria-hidden />}
              {headline}
            </h2>
            {note && <p className="text-sm text-muted-foreground leading-relaxed">{note}</p>}
            <div className="pt-1">{primary}</div>
          </>
        )}
      </div>

      {!hidden && (
        <div className="relative rounded-2xl border border-border bg-card p-5 shadow-2xs">
          <button
            type="button"
            onClick={dismiss}
            aria-label="Hide this"
            className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
          <p className="text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400 mb-3">
            How Sunroot Works
          </p>
          <ol className="grid gap-4 sm:grid-cols-3 text-sm">
            {[
              { n: 1, t: "Pick a class or upload notes", d: "Join your teacher's class, or use the Notebook for your own PDFs." },
              { n: 2, t: "Learn your way", d: "Listen to the audio lesson, try the interactive lab, practise with flashcards." },
              { n: 3, t: "Prove it and grow", d: "Pass the quiz to raise your mastery score, and your skill map adapts to you." },
            ].map((s) => (
              <li key={s.n} className="flex gap-3">
                <span className="h-7 w-7 shrink-0 rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300 text-xs font-black flex items-center justify-center border border-teal-500/20">
                  {s.n}
                </span>
                <div>
                  <b className="block text-foreground text-sm leading-tight mb-0.5">{s.t}</b>
                  <span className="text-xs text-muted-foreground leading-relaxed">{s.d}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
