"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { cn, formatNumber } from "@/lib/utils";
import type { CalendarDay } from "@/lib/streak/logic";

interface StreakData {
  today: string;
  streakDays: number;
  freezes: number;
  maxFreezes: number;
  daysToNextFreeze: number;
  studiedToday: boolean;
  freezePrice: number;
  spendable: number;
  recovery: { available: boolean; cost: number; streak: number; expiresAt: string | null };
  calendar: CalendarDay[];
  history: Array<{ type: string; label: string; detail: string; at: string | null }>;
}

const CELL: Record<CalendarDay["status"], string> = {
  active: "bg-teal-500 text-white",
  frozen: "bg-sky-300 text-sky-950 dark:bg-sky-500/70 dark:text-white",
  missed: "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-500",
};

export default function StreakPage() {
  const { toast } = useToast();
  const [data, setData] = useState<StreakData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/streak")
      .then((r) => r.json())
      .then((json) => !cancelled && json.ok && setData(json.data))
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [reload]);

  async function buy(itemId: string, label: string) {
    if (busy) return;
    setBusy(itemId);
    try {
      const res = await fetch("/api/shop/purchase", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId }) });
      const json = await res.json();
      if (json.ok) {
        toast({ title: label, description: `-${formatNumber(json.data.spent)} XP`, variant: "success" });
        setReload((n) => n + 1);
      } else {
        toast({ title: "Couldn't complete that", description: json.error?.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Connection error", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  const calendar = asArray<CalendarDay>(data?.calendar);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Streak freezes</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">A freeze covers a missed day automatically. You earn one every 7-day streak.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Current streak</p>
          <p className="text-3xl font-extrabold">🔥 {data?.streakDays ?? "…"}</p>
          {data && <p className="text-[11px] text-slate-500">{data.studiedToday ? "Done for today" : "Study today to keep it"}</p>}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Freezes held</p>
          <p className="text-3xl font-extrabold">🧊 {data ? `${data.freezes}/${data.maxFreezes}` : "…"}</p>
          {data && <p className="text-[11px] text-slate-500">Next free one in {data.daysToNextFreeze} day{data.daysToNextFreeze === 1 ? "" : "s"} of streak</p>}
        </Card>
      </div>

      {data?.recovery.available && (
        <Card className="p-4 border-amber-400/60 bg-amber-50 dark:bg-amber-950/20 space-y-2">
          <p className="font-bold text-sm">Your {data.recovery.streak}-day streak just broke</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Restore it today for {formatNumber(data.recovery.cost)} XP, then study to keep it going
            {data.recovery.expiresAt ? ` (offer ends ${new Date(data.recovery.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} your time)` : ""}.
          </p>
          <Button variant="amber" size="sm" isLoading={busy === "streak_recovery"} disabled={!!busy || data.spendable < data.recovery.cost} onClick={() => buy("streak_recovery", "Streak restored")}>
            {data.spendable < data.recovery.cost ? "Not enough XP" : `Recover for ${formatNumber(data.recovery.cost)} XP`}
          </Button>
        </Card>
      )}

      <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold text-sm">Buy a freeze</p>
          <p className="text-xs text-slate-500">{data ? `${formatNumber(data.spendable)} spendable XP` : ""}</p>
        </div>
        <Button
          size="sm"
          isLoading={busy === "streak_freeze"}
          disabled={!data || !!busy || data.freezes >= data.maxFreezes || data.spendable < data.freezePrice}
          onClick={() => buy("streak_freeze", "Streak freeze added")}
        >
          {data && data.freezes >= data.maxFreezes ? "Freezes full" : `🧊 ${data ? formatNumber(data.freezePrice) : ""} XP`}
        </Button>
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Last 30 days</h2>
        <Card className="p-4 space-y-3">
          <div className="grid grid-cols-7 gap-1.5">
            {calendar.map((d) => (
              <div
                key={d.date}
                title={`${d.date}: ${d.status}`}
                className={cn("aspect-square rounded-lg flex items-center justify-center text-[11px] font-semibold", CELL[d.status], d.today && "ring-2 ring-offset-1 ring-teal-600 dark:ring-offset-slate-900")}
              >
                {d.status === "frozen" ? "🧊" : Number(d.date.slice(8))}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded bg-teal-500" /> Studied</span>
            <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded bg-sky-300" /> Frozen</span>
            <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded bg-slate-300 dark:bg-slate-700" /> Missed</span>
          </div>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">History</h2>
        <Card className="p-0 divide-y divide-slate-100 dark:divide-slate-800">
          {data && asArray(data.history).length === 0 && <p className="p-4 text-sm text-slate-500">No freezes used or bought yet.</p>}
          {asArray<StreakData["history"][number]>(data?.history).map((h, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0 truncate">🧊 {h.label}</span>
              <span className="shrink-0 text-xs text-slate-500">{h.type === "used" ? h.detail : h.at ? new Date(h.at).toLocaleDateString() : ""}{h.type !== "used" ? ` · ${h.detail}` : ""}</span>
            </div>
          ))}
        </Card>
      </section>

      <p className="text-xs text-slate-500">
        More ways to spend XP in the <Link href="/shop" className="font-semibold text-teal-600 dark:text-teal-400 underline">shop</Link>.
      </p>
    </div>
  );
}
