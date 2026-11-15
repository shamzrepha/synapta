"use client";

import React, { useState } from "react";
import { Flame, School, ArrowRight, Clock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserStore } from "@/lib/store/use-user-store";
import { openAcademicSetup } from "@/components/profile/profile-setup";
import { Sprout } from "@/components/bot/sprout";
import Link from "next/link";

export function CampusStreakBanner() {
  const user = useUserStore((s) => s.user);
  const [dismissed, setDismissed] = useState(false);

  if (!user || dismissed) return null;

  // 1. Missing Academic Profile Banner
  const needsCampusSetup = !user.institution || !user.department;
  if (needsCampusSetup) {
    return (
      <div className="rounded-2xl border-2 border-brand-500/30 bg-gradient-to-r from-brand-50 via-brand-100/40 to-white dark:from-brand-950/40 dark:via-brand-900/20 dark:to-card p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="relative w-12 h-14 shrink-0 flex items-center justify-center">
            <Sprout pose="search" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-600 text-white flex items-center gap-1">
                <School className="h-3 w-3" /> Campus Setup
              </span>
              <h3 className="text-sm sm:text-base font-bold text-foreground">Where are you studying?</h3>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Select your university and department so Sprout can unlock courses and past questions for your level.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            type="button"
            size="sm"
            onClick={openAcademicSetup}
            className="w-full sm:w-auto bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold"
          >
            Select Campus <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  // 2. Duolingo-style Streak Urgency Banner (shown late in the day if streak is active)
  const currentHour = new Date().getHours();
  const streakDays = user.streakDays || 0;
  const isLate = currentHour >= 18; // After 6 PM

  if (streakDays > 0 && isLate) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-card p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-12 shrink-0 flex items-center justify-center">
            <Sprout pose="jump" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <Flame className="h-4 w-4 text-amber-500 fill-amber-500 animate-pulse" />
              <h3 className="text-xs sm:text-sm font-bold text-foreground">
                Don&apos;t lose your {streakDays}-day streak!
              </h3>
            </div>
            <p className="text-[11px] sm:text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Clock className="h-3 w-3 text-amber-600" />
              Midnight deadline approaching. Do a quick 2-minute drill to keep your momentum alive.
            </p>
          </div>
        </div>
        <Link href="/study/daily" className="w-full sm:w-auto">
          <Button size="sm" variant="outline" className="w-full sm:w-auto border-amber-500/40 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-500/10">
            Keep Streak Alive <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>
    );
  }

  return null;
}
