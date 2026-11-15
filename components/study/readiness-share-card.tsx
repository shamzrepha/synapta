"use client";

import React, { useState } from "react";
import { Share2, Copy, Check, TrendingUp, Award, School, Sparkles, X, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sprout } from "@/components/bot/sprout";
import { LEARNING_COHORTS, type LearnerTelemetryProfile } from "@/lib/learning/telemetry";

interface ReadinessShareModalProps {
  open: boolean;
  onClose: () => void;
  classTitle: string;
  institution?: string | null;
  department?: string | null;
  username?: string | null;
  telemetry: LearnerTelemetryProfile | null;
  completedCount: number;
  totalCount: number;
}

export function ReadinessShareModal({
  open,
  onClose,
  classTitle,
  institution,
  department,
  username,
  telemetry,
  completedCount,
  totalCount,
}: ReadinessShareModalProps) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const readiness = telemetry?.predictedExamReadiness ?? 68;
  const weeklyGain = telemetry?.predictedWeeklyGain ?? 9;
  const cohortId = telemetry?.dominantCohort ?? "step_by_step_procedural";
  const cohortLabel = LEARNING_COHORTS[cohortId]?.label ?? "Micro-Step Formula Breakdown";
  const handle = username || "scholar";
  const origin = typeof window !== "undefined" ? window.location.origin : "https://sunrootlearn.vercel.app";
  const referralUrl = `${origin}/login?ref=${encodeURIComponent(handle)}`;

  const shareText = [
    `SunRoot Exam Readiness Scorecard`,
    `Course: ${classTitle}${institution ? ` (${institution})` : ""}`,
    `Exam Readiness: ${readiness}% (+${weeklyGain}%/wk pace)`,
    `Learning Style Cohort: ${cohortLabel}`,
    `Past Questions Mastered: ${completedCount}/${Math.max(1, totalCount)}`,
    `Practice CBT, Handwritten Paper Snap & Past Questions with me on SunRoot: ${referralUrl}`,
  ].join("\n");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore clipboard failure
    }
  };

  const handleWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/65 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-2xl space-y-4 relative max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="absolute right-3 top-3 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 z-10"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Visual Scorecard */}
        <div className="rounded-2xl border-2 border-brand-500/40 bg-gradient-to-br from-brand-600/15 via-brand-500/5 to-card p-4 sm:p-5 space-y-4 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-brand-600 text-white flex items-center gap-1 shrink-0">
              <Award className="h-3 w-3" /> Official Exam Readiness Card
            </span>
            <span className="text-xs font-bold text-muted-foreground truncate">@{handle}</span>
          </div>

          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-12 h-14 sm:w-14 sm:h-16 shrink-0 flex items-center justify-center">
              <Sprout pose="dance" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold text-foreground leading-snug break-words">
                {classTitle}
              </h3>
              <p className="text-xs text-muted-foreground flex items-start gap-1 mt-0.5 break-words">
                <School className="h-3.5 w-3.5 text-brand-600 shrink-0 mt-0.5" />
                <span>
                  {institution || "University Campus"}
                  {department ? ` • ${department}` : ""}
                </span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <div className="p-3 rounded-xl bg-card/90 border border-border min-w-0">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block truncate">
                Predicted Readiness
              </span>
              <div className="flex flex-wrap items-baseline gap-1 mt-0.5">
                <span className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {readiness}%
                </span>
                <span className="text-[11px] font-bold text-emerald-600 flex items-center">
                  <TrendingUp className="h-3 w-3 mr-0.5" />+{weeklyGain}%/wk
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-card/90 border border-border min-w-0">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block truncate">
                Questions Completed
              </span>
              <div className="flex flex-wrap items-baseline gap-1 mt-0.5">
                <span className="text-xl sm:text-2xl font-black text-brand-600">
                  {completedCount}/{Math.max(1, totalCount)}
                </span>
                <span className="text-[11px] text-muted-foreground font-semibold">mastered</span>
              </div>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-brand-500/10 border border-brand-500/20 flex flex-wrap items-center justify-between gap-1 text-xs">
            <span className="text-muted-foreground font-medium">Adaptive FYP Cohort:</span>
            <span className="font-bold text-brand-700 dark:text-brand-300 flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 shrink-0" /> {cohortLabel}
            </span>
          </div>
        </div>

        {/* Campus Ambassador / Class-Rep Referral Perks */}
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-xs">
          <Gift className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0 break-words">
            <p className="font-bold text-foreground">Campus Class-Rep & Coursemate Bonus</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Your scorecard includes your invite link (<code className="font-mono break-all">?ref={handle}</code>). Earn{" "}
              <strong>+250 XP</strong> per coursemate and unlock a free <strong>14-Day Exam Pass</strong> at 10 referrals!
            </p>
          </div>
        </div>

        {/* Share Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleCopy()}
            className="flex-1 text-xs font-semibold"
          >
            {copied ? (
              <>
                <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-600" /> Copied!
              </>
            ) : (
              <>
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy Scorecard
              </>
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleWhatsApp}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
          >
            <Share2 className="mr-1.5 h-3.5 w-3.5" /> Share to WhatsApp
          </Button>
        </div>
      </div>
    </div>
  );
}
