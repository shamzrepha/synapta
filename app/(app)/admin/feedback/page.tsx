"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { asArray } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";
import { useUserStore } from "@/lib/store/use-user-store";
import { PLAN_DAY_REWARDS, STATUS_LABEL, XP_REWARDS, rewardLabel, type RewardKind } from "@/lib/feedback/rewards";

interface Item { id: string; uid: string; name: string; email: string; institution: string; department: string; kind: string; message: string; page: string; status: string; note: string; reward: { kind: RewardKind; amount: number } | null; createdAt: string }
const FILTERS = ["new", "seen", "planned", "done", "all"];

export default function AdminFeedbackPage() {
  const user = useUserStore((s) => s.user);
  const { toast } = useToast();
  const [filter, setFilter] = useState("new");
  const [items, setItems] = useState<Item[] | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const load = useCallback(() => {
    fetch(`/api/admin/feedback?status=${filter}`).then((r) => r.json()).then((j) => setItems(j.ok ? asArray<Item>(j.data.items) : [])).catch(() => setItems([]));
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (id: string, status: string) => {
    const res = await fetch(`/api/admin/feedback/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!res.ok) return toast({ title: "Couldn't update", variant: "destructive" });
    load();
  };
  const reward = async (id: string) => {
    const [kind, amount] = (pick[id] || "xp:100").split(":");
    const res = await fetch(`/api/admin/feedback/${id}/reward`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, amount: Number(amount) }) });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) return toast({ title: "Couldn't reward", description: j?.error?.message, variant: "destructive" });
    toast({ title: "Reward sent", variant: "success" });
    load();
  };
  if (user && user.role !== "admin") return <p className="text-sm">This page is for admins.</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/admin" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-brand-700 dark:text-brand-300"><ArrowLeft className="h-4 w-4" /> Admin</Link>
      <h1 className="text-2xl font-semibold tracking-tight">Feedback inbox</h1>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter">
        {FILTERS.map((f) => <button key={f} type="button" aria-pressed={filter === f} onClick={() => { setItems(null); setFilter(f); }} className={`min-h-[44px] rounded-full border px-4 text-xs font-semibold capitalize ${filter === f ? "border-brand-600 bg-brand-600 text-white" : "border-border"}`}>{f}</button>)}
      </div>
      {items === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {items?.length === 0 && <Card className="p-5 text-sm text-muted-foreground">Nothing here.</Card>}
      {items?.map((m) => (
        <Card key={m.id} className="space-y-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-mono uppercase tracking-wide text-muted-foreground">{m.kind} · {STATUS_LABEL[m.status] ?? m.status}</span>
            <span className="text-muted-foreground">{m.createdAt.slice(0, 16).replace("T", " ")}</span>
          </div>
          <p className="whitespace-pre-wrap break-words text-sm">{m.message}</p>
          <p className="text-xs text-muted-foreground">{m.name}{m.email ? ` · ${m.email}` : ""}{m.department ? ` · ${m.department}` : ""} · <span className="select-all">{m.uid}</span></p>
          <div className="flex flex-wrap items-center gap-2">
            {["seen", "planned", "done", "declined"].map((s) => <Button key={s} size="sm" variant={m.status === s ? "default" : "outline"} onClick={() => void setStatus(m.id, s)}>{STATUS_LABEL[s]}</Button>)}
          </div>
          {m.reward ? (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300"><Gift className="h-3.5 w-3.5" aria-hidden="true" /> Rewarded: {rewardLabel(m.reward.kind, m.reward.amount)}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Reward" className="h-10 rounded-lg border border-border bg-background px-2 text-xs" value={pick[m.id] || "xp:100"} onChange={(e) => setPick((p) => ({ ...p, [m.id]: e.target.value }))}>
                {XP_REWARDS.map((a) => <option key={a} value={`xp:${a}`}>{a} XP</option>)}
                {PLAN_DAY_REWARDS.map((a) => <option key={a} value={`plan_days:${a}`}>{a} days of the Student plan</option>)}
              </select>
              <Button size="sm" variant="outline" onClick={() => void reward(m.id)}><Gift className="mr-1 h-3.5 w-3.5" /> Reward</Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
