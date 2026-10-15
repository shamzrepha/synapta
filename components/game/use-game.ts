"use client";

import { useEffect, useState } from "react";
import { useRealtime } from "@/components/providers/realtime-provider";

export interface GameState {
  xp: number;
  streakDays: number;
  streakFreezes?: number;
  streakAtRisk?: boolean;
  level: { level: number; title: string; xp: number; currentLevelXp: number; nextLevelXp: number; progress: number };
  stats: Record<string, number>;
  badges: Array<{ id: string; name: string; description: string; emoji: string; rarity: string; earnedAt: string | null }>;
  quests: Array<{ id: string; title: string; emoji: string; target: number; value: number; done: boolean; rewardXp: number }>;
  league: {
    tier: number;
    name: string;
    emoji: string;
    color: string;
    weekId: string;
    endsAt: string;
    standing: { rank: number; cohortSize: number; weeklyXp: number } | null;
  };
  settings: { showOnLeaderboard: boolean; autoShareAchievements: boolean };
}

async function fetchGame(): Promise<GameState | null> {
  try {
    const res = await fetch("/api/me/game");
    const data = await res.json();
    return data.ok ? data.data : null;
  } catch {
    return null;
  }
}

/** Player's game state; refreshes live whenever the server signals this user. */
export function useGameState() {
  const { signalVersion } = useRealtime();
  const [game, setGame] = useState<GameState | null>(null);
  useEffect(() => {
    fetchGame().then((g) => g && setGame(g));
  }, [signalVersion]);
  return { game, setGame };
}

/** "2d 4h", "3h 12m", "45s" */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

/** Re-renders every `intervalMs` so countdowns tick. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
