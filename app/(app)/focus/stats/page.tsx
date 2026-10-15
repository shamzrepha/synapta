"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Flame } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { asArray } from "@/lib/api/client";

interface Stats {
  totalBlocks: number;
  totalMinutes: number;
  todayMinutes: number;
  streak: { current: number; longest: number; activeToday: boolean };
  last14: Array<{ day: string; minutes: number }>;
  recent: Array<{ code: string; minutes: number; doing: string; completedAtMs: number }>;
}

export default function FocusStatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/focus/stats")
      .then((r) => r.json())
      .then((j) => (j.ok ? setStats(j.data) : setFailed(true)))
      .catch(() => setFailed(true));
  }, []);

  const max = Math.max(30, ...asArray<{ minutes: number }>(stats?.last14).map((d) => d.minutes));

  return (
    <div className="max-w-xl mx-auto space-y-4 px-4 sm:px-0 pb-8">
      <Link href="/focus" className="inline-flex items-center gap-1 text-sm text-slate-500 min-h-9">
        <ArrowLeft className="h-4 w-4" /> Focus rooms
      </Link>
      <h1 className="text-2xl font-extrabold tracking-tight">Your focus stats</h1>
      {failed && <p className="text-sm text-slate-500">Couldn&apos;t load your stats. Try again in a moment.</p>}
      {!stats && !failed && <Skeleton className="h-40 w-full rounded-2xl" />}
      {stats && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-3 text-center">
              <p className="text-2xl font-extrabold flex items-center justify-center gap-1">
                <Flame className={stats.streak.current > 0 ? "h-5 w-5 text-orange-500" : "h-5 w-5 text-slate-300"} />
                {stats.streak.current}
              </p>
              <p className="text-[11px] text-slate-500">day streak{!stats.streak.activeToday && stats.streak.current > 0 ? " (focus today!)" : ""}</p>
            </Card>
            <Card className="p-3 text-center">
              <p className="text-2xl font-extrabold">{stats.totalBlocks}</p>
              <p className="text-[11px] text-slate-500">blocks done</p>
            </Card>
            <Card className="p-3 text-center">
              <p className="text-2xl font-extrabold">{Math.round(stats.totalMinutes / 6) / 10}h</p>
              <p className="text-[11px] text-slate-500">total focus</p>
            </Card>
          </div>

          <Card className="p-4">
            <p className="font-bold text-sm mb-3">Last 14 days (minutes)</p>
            <div className="flex items-end gap-1 h-28" role="img" aria-label="Focus minutes per day for the last 14 days">
              {asArray<{ day: string; minutes: number }>(stats.last14).map((d) => (
                <div key={d.day} className="flex-1 flex flex-col justify-end h-full" title={`${d.day}: ${d.minutes} min`}>
                  <div className={d.minutes ? "bg-teal-500 rounded-t" : "bg-slate-200 dark:bg-slate-800 rounded-t"} style={{ height: `${Math.max(4, (d.minutes / max) * 100)}%` }} />
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">Longest streak: {stats.streak.longest} days · Today: {stats.todayMinutes} min</p>
          </Card>

          <Card className="p-4 space-y-2">
            <p className="font-bold text-sm">Recent blocks</p>
            {asArray<Stats["recent"][number]>(stats.recent).length === 0 ? (
              <p className="text-sm text-slate-500">No finished blocks yet. Start a room and focus for one round.</p>
            ) : (
              asArray<Stats["recent"][number]>(stats.recent).map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-sm border-b last:border-0 border-slate-100 dark:border-slate-800 py-1.5">
                  <span className="min-w-0 truncate">{r.doing || "Focus block"}</span>
                  <span className="text-xs text-slate-500 shrink-0">
                    {r.minutes} min · {new Date(r.completedAtMs).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </span>
                </div>
              ))
            )}
          </Card>
        </>
      )}
    </div>
  );
}
