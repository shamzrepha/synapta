"use client";

import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { asArray } from "@/lib/api/client";
import { cn, formatNumber } from "@/lib/utils";

interface Winner {
  rank: number;
  xp: number;
  displayName: string;
  username: string | null;
  photoURL: string | null;
  isMe: boolean;
}
interface PastWeek {
  weekId: string;
  winners: Winner[];
}

/** Past winners: the top 10 by XP gained in each of the last 12 finished weeks. */
export function HallOfFame() {
  const [weeks, setWeeks] = useState<PastWeek[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let ignore = false;
    fetch("/api/leaderboard/winners")
      .then((r) => r.json())
      .then((j) => {
        if (ignore) return;
        if (j.ok) setWeeks(asArray<PastWeek>(j.data?.weeks));
        else setFailed(true);
      })
      .catch(() => !ignore && setFailed(true));
    return () => {
      ignore = true;
    };
  }, []);

  if (failed) return <Card className="p-8 text-center text-sm text-slate-500">Couldn&apos;t load past winners. Try again in a moment.</Card>;
  if (!weeks) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (weeks.length === 0) return <Card className="p-8 text-center text-sm text-slate-500">No finished weeks yet. The first winners appear on Monday.</Card>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">The top 10 by XP earned in each week, for the last 12 weeks. Weeks end Sunday 23:59 Nigeria time.</p>
      {weeks.map((w) => (
        <Card key={w.weekId} className="overflow-hidden">
          <p className="px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-500 border-b border-slate-100 dark:border-slate-800">{w.weekId}</p>
          {w.winners.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">Nobody on the board that week.</p>
          ) : (
            <ol className="divide-y divide-slate-100 dark:divide-slate-800">
              {w.winners.map((x) => (
                <li key={x.rank} className={cn("flex items-center gap-3 px-4 py-2", x.isMe && "bg-brand-500/10")}>
                  <span className="w-6 text-center text-sm font-bold text-slate-500">{x.rank}</span>
                  <Avatar name={x.displayName} photoURL={x.photoURL} seed={`${w.weekId}-${x.rank}`} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{x.isMe ? `${x.displayName} (you)` : x.displayName}</p>
                    {x.username && <p className="text-[11px] text-slate-500 truncate">@{x.username}</p>}
                  </div>
                  <span className="text-sm font-bold tabular-nums">+{formatNumber(x.xp)} XP</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      ))}
    </div>
  );
}
