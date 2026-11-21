"use client";

import React from "react";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StreakTodayData {
  points: number;
  threshold: number;
  remaining: number;
  qualified: boolean;
  message: string;
}

/** "Today's streak: 14/30 points" with a bar: a streak day is earned by learning, not by opening the app. */
export function StreakProgress({ data, className }: { data: StreakTodayData; className?: string }) {
  const pct = Math.min(100, Math.round((data.points / Math.max(1, data.threshold)) * 100));
  return (
    <div className={cn("rounded-md border border-border bg-card px-3 py-2.5", className)} role="group" aria-label="Today's streak progress">
      <div className="flex items-center gap-2">
        <Flame className={cn("h-4 w-4 shrink-0", data.qualified ? "text-amber-500" : "text-muted-foreground")} aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm text-foreground">{data.message}</p>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {data.points}/{data.threshold}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={data.threshold}
        aria-valuenow={data.points}
      >
        <div className={cn("h-full rounded-full", data.qualified ? "bg-brand-700" : "bg-brand-500")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
