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
  const btn = "bg-amber-400 text-slate-900 hover:bg-amber-300 font-bold";

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
          <Sparkles className="h-5 w-5 mr-2" /> Build a new class with AI
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
          <Button size="lg" variant="outline" className="bg-white/10 text-white border-white/30 hover:bg-white/20">
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
          <Sparkles className="h-5 w-5 mr-2" /> Join or pick your first class
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
          <Play className="h-5 w-5 mr-2" /> {label}
        </Button>
      </Link>
    );
    if (failed) note = "Couldn't refresh your progress just now, showing what we had.";
  }

  return (
    <div className="space-y-3">
      <div className="rounded-3xl bg-gradient-to-br from-[#0b2a5b] via-[#0c3a73] to-teal-800 text-white p-5 md:p-7 space-y-3" aria-busy={state === "loading"}>
        <p className="text-xs font-mono tracking-widest text-amber-300">{eyebrow}</p>
        {state === "loading" ? (
          <div className="space-y-3" role="status" aria-label="Loading your next step">
            <div className="h-7 w-3/4 rounded-lg bg-white/15 animate-pulse" />
            <div className="h-11 w-56 rounded-xl bg-white/15 animate-pulse" />
          </div>
        ) : (
          <>
            <h2 className="text-xl md:text-2xl font-extrabold leading-tight flex items-center gap-2">
              {offline && state === "error" && <WifiOff className="h-6 w-6 shrink-0" aria-hidden />}
              {headline}
            </h2>
            {note && <p className="text-sm text-white/80">{note}</p>}
            <div>{primary}</div>
          </>
        )}
      </div>

      {!hidden && (
        <div className="relative rounded-2xl border border-teal-500/30 bg-teal-500/5 p-4">
          <button type="button" onClick={dismiss} aria-label="Hide this" className="absolute right-2 top-2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
          <p className="text-sm font-bold mb-2">How Sunroot works</p>
          <ol className="grid gap-2 sm:grid-cols-3 text-sm">
            {[
              { n: 1, t: "Pick a class or upload notes", d: "Join your teacher's class, or use the Notebook for your own PDFs." },
              { n: 2, t: "Learn your way", d: "Listen to the audio lesson, try the interactive lab, practise with flashcards." },
              { n: 3, t: "Prove it and grow", d: "Pass the quiz to raise your mastery score, and your skill map adapts to you." },
            ].map((s) => (
              <li key={s.n} className="flex gap-2.5">
                <span className="h-7 w-7 shrink-0 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center">{s.n}</span>
                <span>
                  <b className="block leading-tight">{s.t}</b>
                  <span className="text-xs text-slate-500">{s.d}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
