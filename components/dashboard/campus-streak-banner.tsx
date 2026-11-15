"use client";

import React, { useState, useEffect } from "react";
import {
  Flame,
  School,
  ArrowRight,
  Clock,
  X,
  CalendarClock,
  Zap,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserStore } from "@/lib/store/use-user-store";
import { openAcademicSetup } from "@/components/profile/profile-setup";
import { Sprout } from "@/components/bot/sprout";
import type { FormulaStruggleEntry } from "@/lib/learning/telemetry";
import Link from "next/link";

interface CampusStreakBannerProps {
  pendingAssignmentCount?: number;
}

export function CampusStreakBanner({ pendingAssignmentCount = 0 }: CampusStreakBannerProps) {
  const user = useUserStore((s) => s.user);
  const [dismissed, setDismissed] = useState(false);
  const [weakFormula, setWeakFormula] = useState<FormulaStruggleEntry | null>(null);
  const [drillRevealed, setDrillRevealed] = useState(false);
  const [drillCompleted, setDrillCompleted] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch("/api/study/telemetry")
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j.ok && j.data?.profile?.weakFormulas?.length > 0) {
          setWeakFormula(j.data.profile.weakFormulas[0]);
        }
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user || dismissed) return null;

  // 1. Missing Academic Profile Banner
  const needsCampusSetup = !user.institution || !user.department;
  if (needsCampusSetup) {
    return (
      <div className="rounded-2xl border-2 border-brand-500/30 bg-gradient-to-r from-brand-50 via-brand-100/40 to-white dark:from-brand-950/40 dark:via-brand-900/20 dark:to-card p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative overflow-hidden">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="relative w-12 h-14 shrink-0 flex items-center justify-center">
            <Sprout pose="search" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-600 text-white flex items-center gap-1 shrink-0">
                <School className="h-3 w-3" /> Campus Setup
              </span>
              <h3 className="text-sm sm:text-base font-bold text-foreground">Where are you studying?</h3>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 break-words">
              Select your university and department so Sprout can unlock courses and past questions for your level.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <Button
            type="button"
            size="sm"
            onClick={openAcademicSetup}
            className="flex-1 sm:flex-initial bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold"
          >
            Select Campus <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss banner"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // 2. Autonomous Nightly Weak-Formula Micro-Drill (#1)
  if (weakFormula && !drillCompleted) {
    const completeMicroDrill = async () => {
      setDrillCompleted(true);
      await fetch("/api/study/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: `micro_drill_${weakFormula.formula.slice(0, 24)}`,
          topic: weakFormula.topic,
          formulas: [weakFormula.formula],
          dwellMs: 45_000,
          correct: true,
          scorePercent: 95,
        }),
      }).catch(() => null);
    };

    return (
      <div className="rounded-2xl border border-brand-500/40 bg-gradient-to-r from-brand-500/10 via-brand-500/5 to-card p-4 shadow-sm space-y-3 overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-10 h-12 shrink-0 flex items-center justify-center">
              <Sprout pose="think" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-600 text-white flex items-center gap-1 shrink-0">
                  <Zap className="h-3 w-3" /> 60-Sec Weak Formula Micro-Drill
                </span>
                <span className="text-xs font-bold text-foreground truncate">Topic: {weakFormula.topic}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 break-words">
                Your telemetry noticed extra time spent on{" "}
                <code className="font-mono font-bold text-foreground bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded break-all">
                  {weakFormula.formula}
                </code>
                . Conquer it right now to boost your exam readiness!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            {!drillRevealed ? (
              <Button
                size="sm"
                onClick={() => setDrillRevealed(true)}
                className="flex-1 sm:flex-initial bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold"
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Start 60s Drill
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => void completeMicroDrill()}
                className="flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
              >
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Got It — Mark Conquered
              </Button>
            )}
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss banner"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {drillRevealed && (
          <div className="p-3.5 rounded-xl bg-card border border-border text-xs space-y-1.5 animate-in fade-in duration-150 break-words">
            <p className="font-bold text-brand-600">Micro-Step Memory Hook:</p>
            <p className="text-foreground leading-relaxed">
              1. Write down the exact formula:{" "}
              <code className="font-mono font-bold break-all">{weakFormula.formula}</code>.
              <br />
              2. Identify every known variable and convert to standard SI / base units before substituting.
              <br />
              3. Check boundary conditions in <strong>{weakFormula.topic}</strong> so you never lose method marks.
            </p>
          </div>
        )}
      </div>
    );
  }

  // 3. Assignment Deadline Alert Banner
  if (pendingAssignmentCount > 0) {
    return (
      <div className="rounded-2xl border border-rose-500/40 bg-gradient-to-r from-rose-500/10 via-rose-500/5 to-card p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 overflow-hidden">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative w-10 h-12 shrink-0 flex items-center justify-center">
            <Sprout pose="pull" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4 text-rose-500 shrink-0" />
              <h3 className="text-xs sm:text-sm font-bold text-foreground truncate">
                {pendingAssignmentCount} class assignment{pendingAssignmentCount === 1 ? "" : "s"} due soon!
              </h3>
            </div>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 break-words">
              Sprout is ready to walk you through the prerequisite formulas before the submission window closes.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <Link href="/classes" className="flex-1 sm:flex-initial">
            <Button
              size="sm"
              variant="outline"
              className="w-full sm:w-auto border-rose-500/40 text-xs font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-500/10"
            >
              Review Assignments <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </Link>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss banner"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // 4. Duolingo-style Streak Urgency Banner (shown late in the day if streak is active)
  const currentHour = new Date().getHours();
  const streakDays = user.streakDays || 0;
  const isLate = currentHour >= 18;

  if (streakDays > 0 && isLate) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-card p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 overflow-hidden">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative w-10 h-12 shrink-0 flex items-center justify-center">
            <Sprout pose="jump" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Flame className="h-4 w-4 text-amber-500 fill-amber-500 animate-pulse shrink-0" />
              <h3 className="text-xs sm:text-sm font-bold text-foreground truncate">
                Don&apos;t lose your {streakDays}-day streak!
              </h3>
            </div>
            <p className="text-[11px] sm:text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Clock className="h-3 w-3 text-amber-600 shrink-0" />
              <span>Midnight deadline approaching. Do a quick 2-minute drill to keep your momentum alive.</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <Link href="/study/daily" className="flex-1 sm:flex-initial">
            <Button
              size="sm"
              variant="outline"
              className="w-full sm:w-auto border-amber-500/40 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
            >
              Keep Streak Alive <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </Link>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss banner"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
