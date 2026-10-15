"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { GoalMilestone, GoalProgress, GoalTask } from "@/lib/goals/plan";

interface GoalView {
  id: string;
  title: string;
  targetDate: string;
  reminders: boolean;
  milestones: GoalMilestone[];
  tasks: GoalTask[];
  progress: GoalProgress;
}

function fmt(d: string) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function GoalsPage() {
  const { toast } = useToast();
  const [goals, setGoals] = useState<GoalView[] | null>(null);
  const [today, setToday] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [reminders, setReminders] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/goals")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.ok) {
          setGoals(asArray<GoalView>(json.data.goals));
          setToday(json.data.today);
        } else setGoals([]);
      })
      .catch(() => !cancelled && setGoals([]));
    return () => {
      cancelled = true;
    };
  }, []);

  function replace(goal: GoalView) {
    setGoals((cur) => asArray<GoalView>(cur).map((g) => (g.id === goal.id ? goal : g)));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, targetDate: date, reminders }) });
      const json = await res.json();
      if (json.ok) {
        setGoals((cur) => [json.data.goal, ...asArray<GoalView>(cur)]);
        setTitle("");
        setDate("");
        toast({ title: "Plan ready", description: json.data.aiGenerated ? "Your coach broke it into weekly milestones." : "AI is busy, so we made a simple starter plan.", variant: "success" });
      } else {
        toast({ title: "Couldn't create goal", description: json.error?.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Connection error", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function patch(goalId: string, body: Record<string, unknown>, key: string) {
    if (busy) return;
    setBusy(key);
    try {
      const res = await fetch("/api/goals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: goalId, ...body }) });
      const json = await res.json();
      if (json.ok) {
        replace(json.data.goal);
        if (body.action === "replan") toast({ title: "Plan adjusted", description: "Remaining tasks were spread out up to your target date.", variant: "success" });
      } else toast({ title: "Couldn't update", description: json.error?.message, variant: "destructive" });
    } catch {
      toast({ title: "Connection error", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function remove(goalId: string) {
    if (busy || !window.confirm("Delete this goal?")) return;
    setBusy(goalId);
    try {
      const res = await fetch(`/api/goals?id=${encodeURIComponent(goalId)}`, { method: "DELETE" });
      const json = await res.json();
      if (json.ok) setGoals((cur) => asArray<GoalView>(cur).filter((g) => g.id !== goalId));
    } catch {
      toast({ title: "Connection error", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Goal tracker</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Say what you want to achieve and by when. We&apos;ll turn it into weekly milestones and daily tasks.</p>
      </div>

      <Card className="p-4 sm:p-5">
        <form onSubmit={create} className="space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Pass physics by March" maxLength={200} required minLength={3} />
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <Input type="date" value={date} min={today || undefined} onChange={(e) => setDate(e.target.value)} required className="sm:max-w-[200px]" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={reminders} onChange={(e) => setReminders(e.target.checked)} className="h-4 w-4 accent-teal-600" />
              Remind me daily
            </label>
            <Button type="submit" isLoading={creating} disabled={creating || title.trim().length < 3 || !date} className="sm:ml-auto">
              Build my plan
            </Button>
          </div>
        </form>
      </Card>

      {goals === null && <div className="h-32 rounded-2xl bg-slate-100 dark:bg-slate-800/60 animate-pulse" />}
      {goals && goals.length === 0 && <p className="text-sm text-slate-500">No goals yet. Add your first one above.</p>}

      {asArray<GoalView>(goals).map((g) => {
        const p = g.progress;
        return (
          <Card key={g.id} className="p-4 sm:p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-extrabold text-lg break-words">{g.title}</p>
                <p className="text-xs text-slate-500">Target {fmt(g.targetDate)} · {p.done}/{p.total} tasks done</p>
              </div>
              <button type="button" onClick={() => remove(g.id)} aria-label="Delete goal" className="shrink-0 h-9 w-9 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                ✕
              </button>
            </div>

            <div className="space-y-1">
              <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${p.pct}%` }} />
              </div>
              <p className="text-[11px] text-slate-500">{p.pct}% complete</p>
            </div>

            {p.behind && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/60 bg-amber-50 dark:bg-amber-950/20 p-3">
                <p className="text-xs text-amber-900 dark:text-amber-200">You&apos;re behind schedule ({p.overdue} overdue). Spread what&apos;s left over the days remaining.</p>
                <Button size="sm" variant="amber" isLoading={busy === `${g.id}:replan`} disabled={!!busy} onClick={() => patch(g.id, { action: "replan" }, `${g.id}:replan`)}>
                  Replan
                </Button>
              </div>
            )}

            <div className="space-y-3">
              {asArray<GoalMilestone>(g.milestones).map((m) => (
                <div key={m.id} className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{m.title} <span className="font-normal normal-case">({fmt(m.startDate)} to {fmt(m.endDate)})</span></p>
                  {asArray<GoalTask>(g.tasks)
                    .filter((t) => t.milestoneId === m.id)
                    .map((t) => {
                      const overdue = !t.done && t.dueDate < today;
                      return (
                        <label key={t.id} className="flex items-start gap-3 rounded-lg px-1 py-1.5 min-h-[36px] cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <input
                            type="checkbox"
                            checked={t.done}
                            disabled={busy === `${g.id}:${t.id}`}
                            onChange={(e) => patch(g.id, { action: "toggle", taskId: t.id, done: e.target.checked }, `${g.id}:${t.id}`)}
                            className="mt-0.5 h-5 w-5 shrink-0 accent-teal-600"
                          />
                          <span className={cn("min-w-0 flex-1 text-sm", t.done && "line-through text-slate-400")}>{t.title}</span>
                          <span className={cn("shrink-0 text-[11px]", overdue ? "text-rose-500 font-semibold" : "text-slate-400")}>{fmt(t.dueDate)}</span>
                        </label>
                      );
                    })}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                <input type="checkbox" checked={g.reminders} onChange={(e) => patch(g.id, { action: "reminders", enabled: e.target.checked }, `${g.id}:rem`)} className="h-4 w-4 accent-teal-600" />
                Daily reminders
              </label>
              {!p.behind && p.total > p.done && (
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => patch(g.id, { action: "replan" }, `${g.id}:replan`)}>
                  Replan
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
