"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Crown, Timer, Users, Globe, CalendarDays, Shield, GraduationCap, Flame } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { useLiveChannel } from "@/lib/live/client";
import { formatCountdown, useNow } from "@/components/game/use-game";
import { LEAGUE_TIERS, PROMOTE_COUNT, DEMOTE_COUNT, MIN_SIZE_FOR_DEMOTION } from "@/lib/game/leagues";
import { asArray } from "@/lib/api/client";
import { cn, formatNumber } from "@/lib/utils";

type Scope = "league" | "weekly" | "global" | "friends" | "class";

interface Row {
  rank: number;
  uid: string;
  displayName: string;
  username: string | null;
  photoURL: string | null;
  level: number;
  xp: number;
  weeklyXp: number;
  tier: number;
  streakDays: number;
  isMe: boolean;
}

interface Payload {
  rows: Row[];
  me: Row | null;
  channel: string;
  meta: { weekId: string; endsAt: string; tier?: number; name?: string; emoji?: string; joined?: boolean };
}

const TABS: Array<{ key: Scope; label: string; icon: React.ReactNode }> = [
  { key: "league", label: "My league", icon: <Shield className="h-4 w-4" /> },
  { key: "weekly", label: "This week", icon: <CalendarDays className="h-4 w-4" /> },
  { key: "global", label: "All time", icon: <Globe className="h-4 w-4" /> },
  { key: "friends", label: "Friends", icon: <Users className="h-4 w-4" /> },
  { key: "class", label: "Class", icon: <GraduationCap className="h-4 w-4" /> },
];

async function fetchBoard(scope: Scope, classId: string): Promise<Payload | null> {
  try {
    const qs = new URLSearchParams({ scope });
    if (scope === "class" && classId) qs.set("classId", classId);
    const res = await fetch(`/api/leaderboard?${qs}`);
    const data = await res.json();
    return data.ok ? data.data : null;
  } catch {
    return null;
  }
}

export default function LeaderboardPage() {
  const [scope, setScope] = useState<Scope>("league");
  const [classes, setClasses] = useState<Array<{ id: string; title: string }>>([]);
  const [classId, setClassId] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const now = useNow(1000);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sc = params.get("scope") as Scope | null;
    const cid = params.get("classId");
    const t = setTimeout(() => {
      if (sc && TABS.some((x) => x.key === sc)) setScope(sc);
      if (cid) setClassId(cid);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    fetch("/api/classes?scope=mine")
      .then((r) => r.json())
      .then((j) => {
        const list = asArray<{ id: string; title: string }>(j.ok ? j.data : []);
        setClasses(list);
        if (list[0]) setClassId((c) => c || list[0].id);
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (scope === "class" && !classId) return;
    let ignore = false;
    fetchBoard(scope, classId).then((d) => {
      if (ignore) return;
      setData(d);
      setLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, [scope, classId]);

  const refresh = useCallback(() => {
    fetchBoard(scope, classId).then((d) => d && setData(d));
  }, [scope, classId]);
  useLiveChannel(data?.channel, refresh);

  const rows = data?.rows || [];
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  const showScore = (r: Row) => (scope === "global" ? r.xp : r.weeklyXp);
  const size = rows.length;
  const tierIdx = data?.meta.tier ?? 0;

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <Crown className="h-7 w-7 text-amber-500" /> Leaderboard
          </h1>
          <p className="text-sm text-slate-500">Updates live as people learn.</p>
        </div>
        {data?.meta.endsAt && scope !== "global" && (
          <div className="flex items-center gap-1.5 text-sm font-semibold rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-1.5">
            <Timer className="h-4 w-4" /> Week ends in {formatCountdown(new Date(data.meta.endsAt).getTime() - now)}
          </div>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setLoading(true);
              setScope(t.key);
            }}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all",
              scope === t.key ? "bg-teal-600 text-white shadow-sm" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {scope === "class" && (
        <select
          value={classId}
          onChange={(e) => {
            setLoading(true);
            setClassId(e.target.value);
          }}
          className="w-full sm:w-auto h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-sm"
        >
          {classes.length === 0 && <option value="">Join a class first</option>}
          {asArray(classes).map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      )}

      {scope === "league" && (
        <Card className="p-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {LEAGUE_TIERS.map((t, i) => (
              <div
                key={t.name}
                title={t.name}
                className={cn(
                  "shrink-0 flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl",
                  i === tierIdx ? "bg-teal-500/15 ring-2 ring-teal-500" : i < tierIdx ? "opacity-60" : "opacity-30 grayscale"
                )}
              >
                <span className="text-2xl">{t.emoji}</span>
                <span className="text-[10px] font-semibold">{t.name}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Top {PROMOTE_COUNT} move up a league each week; in leagues with {MIN_SIZE_FOR_DEMOTION}+ people the bottom {DEMOTE_COUNT} move down.
          </p>
        </Card>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : scope === "league" && !data?.meta.joined ? (
        <Card className="p-8 text-center space-y-2">
          <p className="text-4xl">{data?.meta.emoji || "🥉"}</p>
          <p className="font-bold">Earn your first XP this week to join the {data?.meta.name || "Bronze"} League</p>
          <p className="text-sm text-slate-500">You&apos;ll be placed with about 30 learners at your level.</p>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">Nobody here yet — be the first!</Card>
      ) : (
        <>
          {/* Podium */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4 items-end">
            {[podium[1], podium[0], podium[2]].map((r, i) => {
              if (!r) return <div key={i} />;
              const place = r.rank;
              const h = place === 1 ? "h-28 sm:h-32" : place === 2 ? "h-20 sm:h-24" : "h-16 sm:h-20";
              return (
                <div key={r.uid} className="flex flex-col items-center gap-2 min-w-0">
                  <div className="relative">
                    {place === 1 && <Crown className="absolute -top-5 left-1/2 -translate-x-1/2 h-5 w-5 text-amber-500" />}
                    <Avatar name={r.displayName} photoURL={r.photoURL} seed={r.uid} size={place === 1 ? 64 : 52} level={r.level} />
                  </div>
                  <p className={cn("text-xs sm:text-sm font-semibold truncate max-w-full", r.isMe && "text-teal-600")}>{r.isMe ? "You" : r.displayName}</p>
                  <div
                    className={cn(
                      "w-full rounded-t-2xl flex flex-col items-center justify-start pt-2 text-white font-extrabold",
                      h,
                      place === 1 ? "bg-gradient-to-b from-amber-400 to-amber-600" : place === 2 ? "bg-gradient-to-b from-slate-300 to-slate-500" : "bg-gradient-to-b from-orange-400 to-orange-700"
                    )}
                  >
                    <span className="text-xl sm:text-2xl">{place}</span>
                    <span className="text-[11px] font-semibold opacity-90">{formatNumber(showScore(r))} XP</span>
                  </div>
                </div>
              );
            })}
          </div>

          <Card className="overflow-hidden">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {rest.map((r) => {
                const promote = scope === "league" && r.rank <= PROMOTE_COUNT;
                const demote = scope === "league" && size >= MIN_SIZE_FOR_DEMOTION && r.rank > size - DEMOTE_COUNT;
                return (
                  <li
                    key={r.uid}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5",
                      r.isMe && "bg-teal-500/10",
                      promote && "border-l-4 border-emerald-500",
                      demote && "border-l-4 border-rose-500"
                    )}
                  >
                    <span className="w-7 text-center text-sm font-bold text-slate-500">{r.rank}</span>
                    <Avatar name={r.displayName} photoURL={r.photoURL} seed={r.uid} size={36} level={r.level} />
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-semibold truncate", r.isMe && "text-teal-700 dark:text-teal-300")}>{r.isMe ? `${r.displayName} (you)` : r.displayName}</p>
                      <p className="text-[11px] text-slate-500 flex items-center gap-2">
                        <span>{LEAGUE_TIERS[r.tier]?.emoji} {LEAGUE_TIERS[r.tier]?.name}</span>
                        {r.streakDays > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Flame className="h-3 w-3 text-amber-500" /> {r.streakDays}
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="text-sm font-bold tabular-nums">{formatNumber(showScore(r))} XP</span>
                  </li>
                );
              })}
            </ul>
          </Card>

          {data?.me && data.me.rank > 3 && (
            <div className="sticky bottom-20 md:bottom-4 z-10">
              <Card className="flex items-center gap-3 px-4 py-3 border-teal-500/50 shadow-xl">
                <span className="w-7 text-center text-sm font-extrabold text-teal-600">#{data.me.rank}</span>
                <Avatar name={data.me.displayName} photoURL={data.me.photoURL} seed={data.me.uid} size={36} level={data.me.level} />
                <p className="flex-1 text-sm font-semibold">Your position</p>
                <span className="text-sm font-bold">{formatNumber(showScore(data.me))} XP</span>
              </Card>
            </div>
          )}
        </>
      )}

      <p className="text-xs text-slate-500 text-center">
        Prefer not to compete? Hide yourself from leaderboards in your profile settings.
      </p>
    </div>
  );
}
