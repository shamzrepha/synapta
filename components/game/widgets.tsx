"use client";

import React from "react";
import Link from "next/link";
import { CheckCircle2, Trophy, Timer } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn, formatNumber } from "@/lib/utils";
import { formatCountdown, useNow, type GameState } from "./use-game";

export function LevelCard({ game }: { game: GameState }) {
  const l = game.level;
  return (
    <Card className="p-5 overflow-hidden relative">
      <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-teal-500/10" />
      <div className="flex items-center gap-4 relative">
        <div className="h-16 w-16 shrink-0 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white flex flex-col items-center justify-center shadow-lg">
          <span className="text-[10px] font-semibold uppercase opacity-80">Level</span>
          <span className="text-2xl font-extrabold leading-none">{l.level}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-lg leading-tight">{l.title}</p>
          <p className="text-xs text-slate-500">{formatNumber(game.xp)} XP total · 🔥 {game.streakDays}-day streak</p>
          <div className="mt-2 h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-700" style={{ width: `${Math.round(l.progress * 100)}%` }} />
          </div>
          <p className="text-[11px] text-slate-500 mt-1">{formatNumber(l.nextLevelXp - l.xp)} XP to level {l.level + 1}</p>
        </div>
      </div>
    </Card>
  );
}

export function QuestsCard({ game }: { game: GameState }) {
  const done = game.quests.filter((q) => q.done).length;
  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-bold">Daily quests</p>
        <span className="text-xs font-semibold text-slate-500">{done}/{game.quests.length} done · resets at midnight UTC</span>
      </div>
      <ul className="space-y-3">
        {game.quests.map((q) => (
          <li key={q.id} className="flex items-center gap-3">
            <span className={cn("h-9 w-9 shrink-0 rounded-xl flex items-center justify-center text-lg", q.done ? "bg-emerald-500/15" : "bg-slate-100 dark:bg-slate-800")}>
              {q.done ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : q.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className={cn("text-sm font-medium truncate", q.done && "line-through text-slate-400")}>{q.title}</p>
                <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 shrink-0">+{q.rewardXp} XP</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div className={cn("h-full rounded-full transition-all duration-700", q.done ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${Math.min(100, (q.value / q.target) * 100)}%` }} />
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">{q.value}/{q.target}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function LeagueCard({ game }: { game: GameState }) {
  const now = useNow(30000);
  const s = game.league.standing;
  return (
    <Link href="/leaderboard" className="block">
      <Card className="p-5 space-y-2 hover:border-teal-500/50 transition-colors">
        <div className="flex items-center justify-between">
          <p className="font-bold flex items-center gap-2">
            <span className="text-2xl">{game.league.emoji}</span> {game.league.name} League
          </p>
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Timer className="h-3.5 w-3.5" /> {formatCountdown(new Date(game.league.endsAt).getTime() - now)}
          </span>
        </div>
        {s ? (
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-extrabold">#{s.rank}</p>
              <p className="text-xs text-slate-500">of {s.cohortSize} this week · {formatNumber(s.weeklyXp)} XP</p>
            </div>
            <p className={cn("text-xs font-semibold", s.rank <= 7 ? "text-emerald-600" : "text-slate-500")}>
              {s.rank <= 7 ? "In the promotion zone ⬆️" : "Top 7 get promoted"}
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Earn XP this week to join a league of ~30 learners. The top 7 move up!</p>
        )}
      </Card>
    </Link>
  );
}

const RARITY_STYLE: Record<string, string> = {
  common: "border-slate-200 dark:border-slate-700",
  rare: "border-sky-400/60 bg-sky-500/5",
  epic: "border-purple-500/60 bg-purple-500/5",
  legendary: "border-amber-400 bg-amber-500/10",
};

export function BadgeGrid({ game, compact = false }: { game: GameState; compact?: boolean }) {
  const earned = game.badges.filter((b) => b.earnedAt).length;
  const list = compact ? [...game.badges].sort((a, b) => Number(!!b.earnedAt) - Number(!!a.earnedAt)).slice(0, 8) : game.badges;
  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-bold flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" /> Badges
        </p>
        <span className="text-xs text-slate-500">{earned}/{game.badges.length} unlocked</span>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
        {list.map((b) => (
          <div
            key={b.id}
            title={`${b.name} — ${b.description}${b.earnedAt ? "" : " (locked)"}`}
            className={cn(
              "aspect-square rounded-2xl border-2 flex flex-col items-center justify-center p-1 text-center",
              b.earnedAt ? RARITY_STYLE[b.rarity] : "border-dashed border-slate-200 dark:border-slate-800 opacity-40 grayscale"
            )}
          >
            <span className="text-2xl">{b.emoji}</span>
            {!compact && <span className="text-[9px] font-semibold leading-tight mt-0.5 line-clamp-2">{b.name}</span>}
          </div>
        ))}
      </div>
    </Card>
  );
}
