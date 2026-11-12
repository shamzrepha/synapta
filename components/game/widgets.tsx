"use client";

import React, { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { usePrefs } from "@/components/settings/use-prefs";
import { useUserStore } from "@/lib/store/use-user-store";
import { ShareSheet } from "@/components/social/share-sheet";
import Link from "next/link";
import { CheckCircle2, Trophy, Timer } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn, formatNumber } from "@/lib/utils";
import { formatCountdown, useNow, type GameState } from "./use-game";

export function LevelCard({ game }: { game: GameState }) {
  const [prefs] = usePrefs();
  const osReduced = useReducedMotion();
  const reduceMotion = Boolean(prefs.reduceMotion || osReduced);
  const l = game.level;
  return (
    <Card className="p-5 overflow-hidden relative border border-border/70 hover:border-brand-500/40 transition-all duration-300">
      <div className="flex items-center gap-4 relative">
        <div className="h-16 w-16 shrink-0 rounded-2xl bg-brand-600 text-white flex flex-col items-center justify-center shadow-md">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider opacity-90">Level</span>
          <span className="font-display text-2xl font-black leading-none">{l.level}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-lg leading-tight text-foreground">{l.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatNumber(game.xp)} XP total · 🔥 {game.streakDays}-day streak
            {game.streakFreezes ? ` · 🧊 ${game.streakFreezes} freeze${game.streakFreezes === 1 ? "" : "s"}` : ""}
          </p>
          <div className="mt-2.5 h-2 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-brand-600 shadow-xs"
              initial={reduceMotion ? false : { width: "0%" }}
              animate={{ width: `${Math.round(l.progress * 100)}%` }}
              transition={{ duration: reduceMotion ? 0 : 0.7, ease: "easeOut" }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground font-medium mt-1">
            {formatNumber(l.nextLevelXp - l.xp)} XP to level {l.level + 1}
          </p>
        </div>
      </div>
      {game.streakAtRisk && (
        <div className="relative mt-3 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
          🔥 Study today to keep your {game.streakDays}-day streak
          {game.streakFreezes ? ` (or a 🧊 freeze will cover you)` : ""} — ends at midnight UTC.
        </div>
      )}
    </Card>
  );
}

export function QuestsCard({ game }: { game: GameState }) {
  const done = game.quests.filter((q) => q.done).length;
  return (
    <Card className="p-5 space-y-3 border border-border/70 hover:border-brand-500/40 transition-all duration-300">
      <div className="flex items-center justify-between">
        <p className="font-display font-bold text-foreground">Daily Quests</p>
        <span className="text-xs font-semibold text-muted-foreground">{done}/{game.quests.length} done</span>
      </div>
      <ul className="space-y-3">
        {game.quests.map((q) => (
          <li key={q.id} className="flex items-center gap-3">
            <span className={cn("h-9 w-9 shrink-0 rounded-xl flex items-center justify-center text-lg border border-border/50", q.done ? "bg-emerald-500/15 border-emerald-500/30" : "bg-muted/70")}>
              {q.done ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : q.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className={cn("text-sm font-medium truncate text-foreground", q.done && "line-through text-muted-foreground")}>{q.title}</p>
                <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 shrink-0">+{q.rewardXp} XP</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={cn("h-full rounded-full transition-all duration-700", q.done ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${Math.min(100, (q.value / q.target) * 100)}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{q.value}/{q.target}</p>
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
    <Link href="/leaderboard" className="block group">
      <Card className="p-5 space-y-2 border border-border/70 group-hover:border-brand-500/50 group-hover:-translate-y-0.5 transition-all duration-300">
        <div className="flex items-center justify-between">
          <p className="font-display font-bold flex items-center gap-2 text-foreground">
            <span className="text-2xl">{game.league.emoji}</span> {game.league.name} League
          </p>
          <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
            <Timer className="h-3.5 w-3.5" /> {formatCountdown(new Date(game.league.endsAt).getTime() - now)}
          </span>
        </div>
        {s ? (
          <div className="flex items-end justify-between pt-1">
            <div>
              <p className="font-display text-3xl font-black text-foreground">#{s.rank}</p>
              <p className="text-xs text-muted-foreground">of {s.cohortSize} this week · {formatNumber(s.weeklyXp)} XP</p>
            </div>
            <p className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border", s.rank <= 7 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" : "bg-muted text-muted-foreground border-border/50")}>
              {s.rank <= 7 ? "Promotion zone ⬆️" : "Top 7 get promoted"}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Earn XP this week to join a league of ~30 learners. Top 7 move up!</p>
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
  const [prefs] = usePrefs();
  const osReduced = useReducedMotion();
  const reduceMotion = Boolean(prefs.reduceMotion || osReduced);
  const { user } = useUserStore();
  const [sharing, setSharing] = useState<GameState["badges"][number] | null>(null);
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
        {list.map((b, idx) => (
          <motion.button
            type="button"
            key={b.id}
            disabled={!b.earnedAt}
            onClick={() => setSharing(b)}
            whileHover={reduceMotion || !b.earnedAt ? undefined : { scale: 1.07, rotate: -2 }}
            whileTap={reduceMotion || !b.earnedAt ? undefined : { scale: 0.96 }}
            initial={reduceMotion || !b.earnedAt ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: b.earnedAt ? 1 : 0.4, scale: 1 }}
            transition={{ delay: reduceMotion ? 0 : Math.min(0.25, idx * 0.02), duration: 0.2 }}
            title={`${b.name} — ${b.description}${b.earnedAt ? " (tap to share)" : " (locked)"}`}
            className={cn(
              "aspect-square rounded-2xl border-2 flex flex-col items-center justify-center p-1 text-center",
              b.earnedAt ? RARITY_STYLE[b.rarity] : "border-dashed border-slate-200 dark:border-slate-800 grayscale"
            )}
          >
            <span className="text-2xl">{b.emoji}</span>
            {!compact && <span className="text-[9px] font-semibold leading-tight mt-0.5 line-clamp-2">{b.name}</span>}
          </motion.button>
        ))}
      </div>
      {sharing && (
        <ShareSheet
          attachment={{ type: "badge", id: sharing.id, title: `${sharing.name} badge`, subtitle: sharing.description, href: `/u/${user?.username || user?.uid || ""}`, emoji: sharing.emoji }}
          onClose={() => setSharing(null)}
        />
      )}
    </Card>
  );
}
