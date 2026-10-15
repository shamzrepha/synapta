"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { cn, formatNumber } from "@/lib/utils";
import type { SeasonView } from "@/lib/quests/server";

interface DailyQuest {
  id: string;
  title: string;
  emoji: string;
  target: number;
  value: number;
  done: boolean;
  rewardXp: number;
}

function Bar({ value, target, done }: { value: number; target: number; done: boolean }) {
  return (
    <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
      <div className={cn("h-full rounded-full transition-all", done ? "bg-emerald-500" : "bg-teal-500")} style={{ width: `${Math.min(100, Math.round((value / Math.max(1, target)) * 100))}%` }} />
    </div>
  );
}

export default function QuestsPage() {
  const { toast } = useToast();
  const [seasons, setSeasons] = useState<SeasonView[] | null>(null);
  const [daily, setDaily] = useState<DailyQuest[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/quests")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json.ok) return;
        setSeasons(asArray<SeasonView>(json.data.seasons));
        setDaily(asArray<DailyQuest>(json.data.daily));
      })
      .catch(() => !cancelled && setSeasons([]));
    return () => {
      cancelled = true;
    };
  }, []);

  async function claim(id: string) {
    if (claiming) return;
    setClaiming(id);
    try {
      const res = await fetch("/api/quests/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seasonId: id }) });
      const json = await res.json();
      if (json.ok) {
        setSeasons(asArray<SeasonView>(json.data.seasons));
        toast({
          title: json.data.alreadyClaimed ? "Already claimed" : "Reward claimed!",
          description: json.data.alreadyClaimed ? undefined : `+${json.data.rewardXp} XP and a new badge.`,
          variant: "success",
        });
      } else {
        toast({ title: "Can't claim yet", description: json.error?.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Connection error", variant: "destructive" });
    } finally {
      setClaiming(null);
    }
  }

  const active = asArray<SeasonView>(seasons).filter((s) => s.status === "active");
  const past = asArray<SeasonView>(seasons).filter((s) => s.status === "ended");

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Seasonal quests</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Limited-time goals with XP and a special badge.</p>
      </div>

      {seasons === null && <div className="h-40 rounded-2xl bg-slate-100 dark:bg-slate-800/60 animate-pulse" />}
      {seasons && active.length === 0 && <Card className="p-5 text-sm text-slate-500">No season is running right now. Check back soon!</Card>}

      {active.map((s) => (
        <Card key={s.id} className="p-4 sm:p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-lg font-extrabold">{s.emoji} {s.name}</p>
              <p className="text-xs text-slate-500">{s.blurb}</p>
            </div>
            <span className="shrink-0 rounded-full bg-teal-500/10 px-2.5 py-1 text-[11px] font-semibold text-teal-700 dark:text-teal-300">{s.daysLeft} day{s.daysLeft === 1 ? "" : "s"} left</span>
          </div>
          <div className="space-y-3">
            {s.tasks.map((t) => (
              <div key={t.id} className="space-y-1">
                <div className="flex justify-between gap-2 text-sm">
                  <span className={cn(t.done && "line-through text-slate-400")}>{t.title}</span>
                  <span className="shrink-0 text-xs text-slate-500">{formatNumber(t.value)}/{formatNumber(t.target)}</span>
                </div>
                <Bar value={t.value} target={t.target} done={t.done} />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
            <p className="text-xs text-slate-600 dark:text-slate-400">Reward: +{s.rewardXp} XP and {s.badge.emoji} {s.badge.name} badge</p>
            <Button size="sm" disabled={!s.complete || s.claimed || !!claiming} isLoading={claiming === s.id} onClick={() => claim(s.id)}>
              {s.claimed ? "Claimed" : s.complete ? "Claim reward" : "Keep going"}
            </Button>
          </div>
        </Card>
      ))}

      {daily.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Today&apos;s daily quests</h2>
          <Card className="p-4 space-y-3">
            {daily.map((q) => (
              <div key={q.id} className="space-y-1">
                <div className="flex justify-between gap-2 text-sm">
                  <span className={cn(q.done && "line-through text-slate-400")}>{q.emoji} {q.title}</span>
                  <span className="shrink-0 text-xs text-slate-500">{q.value}/{q.target}</span>
                </div>
                <Bar value={q.value} target={q.target} done={q.done} />
              </div>
            ))}
          </Card>
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Past seasons</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {past.map((s) => {
              const done = s.tasks.filter((t) => t.done).length;
              return (
                <Card key={s.id} className="p-4 space-y-2">
                  <p className="font-bold">{s.emoji} {s.name}</p>
                  <p className="text-xs text-slate-500">{s.start} to {s.end} · {done}/{s.tasks.length} tasks</p>
                  {s.claimed ? (
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{s.badge.emoji} {s.badge.name} badge earned</p>
                  ) : s.complete ? (
                    <Button size="sm" variant="outline" isLoading={claiming === s.id} disabled={!!claiming} onClick={() => claim(s.id)}>Claim reward</Button>
                  ) : (
                    <p className="text-xs text-slate-400">Not completed</p>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
