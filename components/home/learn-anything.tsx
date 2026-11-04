import React from "react";
import Link from "next/link";

const WAYS = [
  { e: "📄", t: "Upload notes or a PDF", d: "Typed, scanned or handwritten. Get clean notes and an interactive lesson.", h: "/study/notes" },
  { e: "📸", t: "Snap a page or a problem", d: "Photograph it and get a step-by-step explanation.", h: "/study/snap" },
  { e: "💬", t: "Ask about anything", d: "Maths, law, languages, science, code: the tutor explains it your way.", h: "/tutor" },
];

/** The universal way in: Sunroot is for any subject, so the first question is what you want to learn, not which tool to open. */
export function LearnAnything() {
  return (
    <section aria-label="What do you want to learn?" className="space-y-2">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">What do you want to learn today?</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {WAYS.map((w) => (
          <Link key={w.h} href={w.h} className="rounded-2xl border border-teal-500/40 bg-teal-500/5 p-4 hover:border-teal-500">
            <span className="text-2xl" aria-hidden>{w.e}</span>
            <p className="font-bold text-sm mt-1">{w.t}</p>
            <p className="text-xs text-slate-500">{w.d}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
