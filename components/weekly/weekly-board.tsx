"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useLiveChannel } from "@/lib/live/client";
import { asArray } from "@/lib/api/client";
import { cn, formatNumber } from "@/lib/utils";

interface Row {
  rank: number;
  uid: string;
  displayName: string;
  photoURL: string | null;
  level?: number;
  xp: number;
  isMe: boolean;
}
interface Payload {
  weekId: string;
  rows: Row[];
  me: Row | null;
  channel: string;
  lastWeek: { weekId: string; winners: Row[] };
}

const MEDAL = ["🥇", "🥈", "🥉"];

async function load(): Promise<Payload | null> {
  try {
    const j = await fetch("/api/leaderboard/weekly").then((r) => r.json());
    return j.ok ? j.data : null;
  } catch {
    return null;
  }
}

export function WeeklyBoard() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    load().then((d) => {
      if (ignore) return;
      setData(d);
      setLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, []);
  const refresh = useCallback(() => {
    load().then((d) => d && setData(d));
  }, []);
  useLiveChannel(data?.channel, refresh);

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (!data) return <Card className="p-8 text-center text-sm text-slate-500">Couldn&apos;t load the weekly board. Try again in a moment.</Card>;

  const winners = asArray<Row>(data.lastWeek?.winners);
  const rows = asArray<Row>(data.rows);

  return (
    <div className="space-y-4">
      {winners.length > 0 && (
        <Card className="p-4 space-y-2 border-amber-500/30 bg-amber-500/5">
          <p className="text-sm font-bold flex items-center gap-1.5">
            <Trophy className="h-4 w-4 text-amber-500" /> Last week&apos;s winners <span className="text-xs font-normal text-slate-500">({data.lastWeek.weekId})</span>
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {winners.map((w) => (
              <li key={w.uid} className={cn("flex items-center gap-2 rounded-xl px-3 py-2 bg-white/60 dark:bg-slate-900/60", w.isMe && "ring-2 ring-teal-500")}>
                <span className="text-xl">{MEDAL[w.rank - 1] || "🏆"}</span>
                <Avatar name={w.displayName} photoURL={w.photoURL} seed={w.uid} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{w.isMe ? "You" : w.displayName}</p>
                  <p className="text-[11px] text-slate-500">{formatNumber(w.xp)} XP</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">A fresh week. Earn some XP to take the top spot!</Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r) => (
              <li key={r.uid} className={cn("flex items-center gap-3 px-4 py-2.5", r.isMe && "bg-teal-500/10")}>
                <span className="w-7 text-center text-sm font-bold text-slate-500">{MEDAL[r.rank - 1] || r.rank}</span>
                <Avatar name={r.displayName} photoURL={r.photoURL} seed={r.uid} size={36} level={r.level} />
                <p className={cn("min-w-0 flex-1 text-sm font-semibold truncate", r.isMe && "text-teal-700 dark:text-teal-300")}>
                  {r.isMe ? `${r.displayName} (you)` : r.displayName}
                </p>
                <span className="text-sm font-bold tabular-nums">{formatNumber(r.xp)} XP</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.me ? (
        data.me.rank > 50 || !rows.some((r) => r.isMe) ? (
          <Card className="flex items-center gap-3 px-4 py-3 border-teal-500/50">
            <span className="text-sm font-extrabold text-teal-600">#{data.me.rank}</span>
            <p className="flex-1 text-sm font-semibold">Your rank this week</p>
            <span className="text-sm font-bold">{formatNumber(data.me.xp)} XP</span>
          </Card>
        ) : null
      ) : (
        <p className="text-xs text-slate-500 text-center">Earn XP this week to appear on the board.</p>
      )}
    </div>
  );
}
