"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Camera, FileUp, Sparkles, Wrench, CheckCircle2, Headphones, ArrowRight } from "lucide-react";

const TILES = [
  { href: "/study/notes", icon: FileUp, title: "Upload notes", hint: "PDF, scan or photo" },
  { href: "/study/snap", icon: Camera, title: "Snap homework", hint: "Get it explained" },
  { href: "/notebook", icon: BookOpen, title: "Chat with a document", hint: "Ask, with sources" },
  { href: "/tutor", icon: Sparkles, title: "Ask the tutor", hint: "Text or voice" },
];

const QUICK_STARTS = [
  { id: "learn", label: "Learn something", icon: BookOpen, getHref: (q: string) => q ? `/tutor?q=${encodeURIComponent(q)}` : "/tutor" },
  { id: "lab", label: "Try a lab", icon: Wrench, getHref: (q: string) => q ? `/studio?q=${encodeURIComponent(q)}` : "/studio" },
  { id: "test", label: "Test my knowledge", icon: CheckCircle2, getHref: (q: string) => q ? `/study/evaluation?q=${encodeURIComponent(q)}` : "/study/evaluation" },
  { id: "listen", label: "Listen & learn", icon: Headphones, getHref: () => "/notebook" },
];

/** The four ways to put something in, plus a unified "Start Learning" topic prompt right on Home. */
export function AddMaterialStrip() {
  const router = useRouter();
  const [topic, setTopic] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = topic.trim();
    router.push(q ? `/tutor?q=${encodeURIComponent(q)}` : "/tutor");
  };

  return (
    <section aria-labelledby="start-learning-heading" className="space-y-3">
      <div className="rounded-lg border border-border bg-card p-4 md:p-5 space-y-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">Start learning</p>
          <h2 id="start-learning-heading" className="mt-0.5 text-base font-semibold tracking-tight text-foreground md:text-lg">
            What are you trying to understand today?
          </h2>
          <p className="text-xs text-muted-foreground">
            Let&apos;s work on something you find difficult. Enter a topic, course, or question.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
          <label htmlFor="start-learning-topic" className="sr-only">
            Enter a topic, course, or question
          </label>
          <input
            id="start-learning-topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Enter a topic, course, or question… e.g. Ohm's Law, Arduino PWM, Calculus limits"
            className="flex-1 h-10 rounded-md border border-border bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-600 focus:outline-none dark:focus:border-brand-400"
          />
          <button
            type="submit"
            className="h-10 px-4 rounded-md bg-brand-600 hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors"
          >
            Start <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick start learning modes">
          {QUICK_STARTS.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.id}
                href={a.getHref(topic.trim())}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-brand-600 hover:text-brand-700 dark:hover:border-brand-400 dark:hover:text-brand-300"
              >
                <Icon className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                {a.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {TILES.map((t) => (
          <Link key={t.href} href={t.href} className="group flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-brand-600 dark:hover:border-brand-400">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-600/10 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              <t.icon className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-medium leading-tight">{t.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{t.hint}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
