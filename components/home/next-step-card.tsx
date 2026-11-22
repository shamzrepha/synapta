"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, ChevronDown, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { asArray } from "@/lib/api/client";
import { pickNextStep, type NextStepInput } from "@/lib/home/next-step";
import { daysUntil } from "@/lib/exams/schedule";

interface Counts {
  dueCards: number;
  openMistakes: number;
  exam: NextStepInput["exam"];
  ready: boolean;
}

const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Real numbers only: due cards, open mistakes and the nearest exam, each read from saved data. A failed read leaves that part out. */
function useCounts(enabled: boolean): Counts {
  const [c, setC] = useState<Counts>({ dueCards: 0, openMistakes: 0, exam: null, ready: false });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const get = (u: string) => fetch(u).then((r) => r.json()).catch(() => null);
    Promise.all([get("/api/flashcards"), get("/api/study/mistakes?status=open"), get("/api/study/exams")]).then(([f, m, e]) => {
      if (!alive) return;
      const today = localDay();
      const plans = asArray<{ name?: string; examDate?: string }>(e?.data?.items)
        .filter((p) => typeof p.examDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.examDate))
        .map((p) => ({ name: String(p.name || "Your exam"), daysLeft: daysUntil(p.examDate as string, today) }))
        .filter((p) => p.daysLeft >= 0)
        .sort((a, b) => a.daysLeft - b.daysLeft);
      setC({ dueCards: Number(f?.data?.stats?.dueToday) || 0, openMistakes: Number(m?.data?.counts?.open) || 0, exam: plans[0] ?? null, ready: true });
    });
    return () => {
      alive = false;
    };
  }, [enabled]);
  return c;
}

/**
 * Home's one recommended step, with the reason, and a way to choose something else.
 * It never shows an invented number: a count appears only if it was read from the student's own data.
 */
export function NextStepCard({
  topic,
  classCount,
  offline,
  allDoneToday,
  progressNote,
}: {
  topic: NextStepInput["topic"];
  classCount: number;
  offline?: boolean;
  allDoneToday?: boolean;
  progressNote?: string | null;
}) {
  const counts = useCounts(!offline);
  const [more, setMore] = useState(false);
  const step = pickNextStep({ dueCards: counts.dueCards, openMistakes: counts.openMistakes, exam: counts.exam, topic, classCount });
  const btn = "bg-brand-600 text-white hover:bg-brand-700 dark:bg-brand-500 font-semibold transition-colors";

  return (
    <section aria-label="Your next step" className="rounded-xl border border-brand-500/25 bg-card p-5 shadow-sm space-y-3 md:p-6" aria-busy={!counts.ready && !offline}>
      {step.examNote && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <CalendarClock className="h-4 w-4 text-brand-600 dark:text-brand-300" aria-hidden="true" /> {step.examNote}
          <Link href="/study/exams" className="ml-1 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">See plan</Link>
        </p>
      )}
      <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{allDoneToday ? "Goals done. Optional next step" : "Your next step"}</p>
      <h2 className="text-xl font-semibold leading-tight text-foreground md:text-2xl">{step.main.title}</h2>
      <p className="text-sm text-muted-foreground leading-relaxed"><span className="font-semibold text-foreground">Why: </span>{step.main.reason}</p>
      {offline && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><WifiOff className="h-3.5 w-3.5" aria-hidden="true" /> You are offline, so due counts may be out of date.</p>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Link href={step.main.href}>
          <Button size="lg" className={btn}>
            {step.main.cta} <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
        </Link>
        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          className="inline-flex min-h-[44px] items-center gap-1 rounded-md px-3 text-sm font-semibold text-muted-foreground hover:bg-muted/60"
        >
          Choose another <ChevronDown className={`h-4 w-4 transition-transform ${more ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </div>
      {more && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {step.others.map((o) => (
            <li key={o.id}>
              <Link href={o.href} className="flex min-h-[48px] items-center gap-3 px-3 py-2 hover:bg-muted/60">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{o.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{o.reason}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {progressNote && <p className="border-t border-border pt-3 text-xs text-muted-foreground">{progressNote}</p>}
    </section>
  );
}
