"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Cpu, Sparkles, SlidersHorizontal, Check } from "lucide-react";
import { asArray } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { LearnerDna } from "@/lib/adaptive/learner-dna";

interface CohortOption {
  id: string;
  label: string;
  shortLabel: string;
}

export function AdaptiveDnaStrip() {
  const [dna, setDna] = useState<LearnerDna | null>(null);
  const [cohorts, setCohorts] = useState<CohortOption[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let ignore = false;
    fetch("/api/study/dna")
      .then((r) => r.json())
      .then((json) => {
        if (!ignore && json?.ok && json.data) {
          if (json.data.dna) setDna(json.data.dna as LearnerDna);
          setCohorts(asArray(json.data.cohorts) as CohortOption[]);
        }
      })
      .catch(() => null);
    return () => {
      ignore = true;
    };
  }, []);

  const choosePreference = async (cohortId: string | null) => {
    setSavingId(cohortId || "auto");
    try {
      const res = await fetch("/api/study/dna", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredCohort: cohortId }),
      });
      const json = await res.json();
      if (json?.ok && json.data?.dna) {
        setDna(json.data.dna as LearnerDna);
      }
      setEditing(false);
    } catch {
      // ignore transient error
    } finally {
      setSavingId(null);
    }
  };

  if (!dna) return null;

  const activeMisconceptions = asArray(dna.activeMisconceptions);
  const weakFormulas = asArray(dna.weakFormulas);

  return (
    <div className="rounded-xl border border-brand-500/25 bg-brand-500/5 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-brand-600 text-white shrink-0">
            <Cpu className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground flex items-center gap-1.5 flex-wrap">
              <span>Live Adaptive AI DNA</span>
              <span className="rounded-full bg-brand-600/15 text-brand-700 dark:text-brand-300 px-2 py-0.5 text-[10px] font-semibold">
                {dna.cohortSummary}
              </span>
              <span className="rounded-full bg-slate-200/80 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                {dna.paceProfile.replace(/_/g, " ")}
              </span>
            </p>
            <p className="text-[11px] text-muted-foreground">
              Every AI tutor answer, quiz focus & coaching plan adapts automatically ({dna.totalSignals} signals · Readiness {dna.predictedReadiness}%).
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-semibold text-foreground hover:border-brand-500 transition shrink-0"
        >
          <SlidersHorizontal className="h-3 w-3 text-brand-500" />
          {editing ? "Done" : "Tune AI Style"}
        </button>
      </div>

      {(activeMisconceptions.length > 0 || weakFormulas.length > 0) && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {activeMisconceptions.slice(0, 2).map((m) => (
            <span
              key={m.label}
              className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-200"
            >
              <Sparkles className="h-2.5 w-2.5" /> Repairing: {m.label}
            </span>
          ))}
          {weakFormulas.slice(0, 2).map((f) => (
            <span
              key={f.formula}
              className="inline-flex items-center rounded-md border border-rose-500/25 bg-rose-500/10 px-2 py-0.5 text-[10px] font-mono text-rose-700 dark:text-rose-300"
            >
              Friction: {f.formula.slice(0, 28)}
            </span>
          ))}
        </div>
      )}

      {editing && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/60">
          <button
            type="button"
            disabled={Boolean(savingId)}
            onClick={() => choosePreference(null)}
            className={cn(
              "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold border transition",
              !dna.preferredModalityOverride
                ? "border-brand-500 bg-brand-600 text-white"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            )}
          >
            {!dna.preferredModalityOverride && <Check className="h-3 w-3" />}
            Auto Detect
          </button>
          {cohorts.map((c) => {
            const active = dna.preferredModalityOverride === c.id;
            return (
              <button
                key={c.id}
                type="button"
                disabled={Boolean(savingId)}
                onClick={() => choosePreference(c.id)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold border transition",
                  active
                    ? "border-brand-500 bg-brand-600 text-white"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                )}
              >
                {active && <Check className="h-3 w-3" />}
                {c.shortLabel}
              </button>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        <Link href="/for-you" className="font-semibold text-brand-700 underline-offset-2 hover:underline dark:text-brand-300">For you</Link>
        {" "}picks what to study next and says why.{" "}
        <Link href="/my-learning-map" className="underline underline-offset-2">My learning map</Link>
      </p>
    </div>
  );
}
