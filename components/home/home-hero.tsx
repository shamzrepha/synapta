"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Play, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { asArray } from "@/lib/api/client";

interface Next {
  classId: string;
  className: string;
  kcId: string | null;
  title: string | null;
}

const KEY = "sunroot_how_it_works_hidden";

/** The one obvious thing to do next, plus a three-step "how it works" for newcomers. */
export function HomeHero({ role, classes, loading }: { role: string | undefined; classes: Array<{ id: string; title: string }>; loading: boolean }) {
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
        const pick = kcs.find((k) => (mastery[k.id] ?? 0) < 0.7) || kcs[0];
        setNext({ classId: first.id, className: first.title, kcId: pick?.id ?? null, title: pick?.title ?? null });
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

  let primary: React.ReactNode;
  if (loading) primary = null;
  else if (teacher) {
    primary = (
      <Link href="/explore?create=1">
        <Button size="lg" className="bg-amber-400 text-slate-900 hover:bg-amber-300 font-bold">
          <Sparkles className="h-5 w-5 mr-2" /> Build a new class with AI
        </Button>
      </Link>
    );
  } else if (!first) {
    primary = (
      <Link href="/explore">
        <Button size="lg" className="bg-amber-400 text-slate-900 hover:bg-amber-300 font-bold">
          <Sparkles className="h-5 w-5 mr-2" /> Join or pick your first class
        </Button>
      </Link>
    );
  } else {
    primary = (
      <Link href={next?.kcId ? `/classes/${next.classId}/topics/${next.kcId}` : `/classes/${first.id}`}>
        <Button size="lg" className="bg-amber-400 text-slate-900 hover:bg-amber-300 font-bold">
          <Play className="h-5 w-5 mr-2" /> {next?.title ? `Continue learning: ${next.title}` : `Open ${first.title}`}
        </Button>
      </Link>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-3xl bg-gradient-to-br from-[#0b2a5b] via-[#0c3a73] to-teal-800 text-white p-5 md:p-7 space-y-3">
        <p className="text-xs font-mono tracking-widest text-amber-300">{teacher ? "TEACH" : "YOUR NEXT STEP"}</p>
        <h2 className="text-xl md:text-2xl font-extrabold leading-tight">
          {teacher ? "Upload a syllabus or notes and let the AI map your class." : first ? "Pick up right where you left off." : "Start by joining a class."}
        </h2>
        <div>{primary}</div>
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
