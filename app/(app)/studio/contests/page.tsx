"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { useUserStore } from "@/lib/store/use-user-store";
import { formatNaira } from "@/lib/studio/bom";
import { shopItems } from "@/lib/studio/parts/shop";
import { ALWAYS_ALLOWED } from "@/lib/studio/parts/shop";
import type { ContestView } from "@/lib/studio/contest-server";
import { cn } from "@/lib/utils";

const SHOP = shopItems().filter((i) => !ALWAYS_ALLOWED.includes(i.type));

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export default function ContestsPage() {
  const { toast } = useToast();
  const role = useUserStore((s) => s.user?.role);
  const canCreate = role === "teacher" || role === "admin";
  const [list, setList] = useState<ContestView[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [deadline, setDeadline] = useState("");
  const [budget, setBudget] = useState("5000");
  const [allowed, setAllowed] = useState<string[]>([]);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    fetch("/api/studio/contests")
      .then((r) => r.json())
      .then((j) => live && setList(j.ok ? asArray<ContestView>(j.data.contests) : []))
      .catch(() => live && setList([]));
    return () => {
      live = false;
    };
  }, [reload]);

  const create = async () => {
    setBusy(true);
    try {
      const j = await fetch("/api/studio/contests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, brief, deadline: new Date(deadline).toISOString(), budget: Math.round(Number(budget) || 0), allowedParts: allowed }),
      }).then((r) => r.json());
      if (j.ok) {
        toast({ title: "Contest created" });
        setCreating(false);
        setTitle("");
        setBrief("");
        setReload((n) => n + 1);
      } else toast({ title: "Couldn't create the contest", description: j.error?.message, variant: "destructive" });
    } catch {
      toast({ title: "Couldn't create the contest", description: "Check the deadline date.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const field = "h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm";
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/studio" className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="Back to Maker Studio">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-extrabold">🏁 Build contests</h1>
          <p className="text-xs text-slate-500">Build the best design within a parts budget. Other students vote.</p>
        </div>
        {canCreate && (
          <Button size="sm" onClick={() => setCreating((c) => !c)}>
            <Plus className="h-4 w-4 mr-1" /> New contest
          </Button>
        )}
      </div>

      {canCreate && creating && (
        <Card className="p-4 space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Title, e.g. Cheapest night light" className={field} aria-label="Title" />
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3} maxLength={2000} placeholder="The brief: what must the design do?" className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm" aria-label="Brief" />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold space-y-1 block">
              Deadline
              <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={field} />
            </label>
            <label className="text-xs font-semibold space-y-1 block">
              Parts budget (₦)
              <input type="number" min={0} step={100} value={budget} onChange={(e) => setBudget(e.target.value)} className={field} />
            </label>
          </div>
          <div>
            <p className="text-xs font-semibold mb-1">Allowed parts <span className="font-normal text-slate-500">(none ticked = any shop part; board, resistor, LED, button and switch are always allowed)</span></p>
            <div className="flex flex-wrap gap-2">
              {SHOP.map((p) => {
                const on = allowed.includes(p.type);
                return (
                  <button key={p.type} type="button" onClick={() => setAllowed(on ? allowed.filter((t) => t !== p.type) : [...allowed, p.type])} className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold min-h-[36px]", on ? "bg-teal-600 text-white border-teal-600" : "border-slate-300 dark:border-slate-700")}>
                    {p.name.replace(/ \(.*\)$/, "")}
                  </button>
                );
              })}
            </div>
          </div>
          <Button isLoading={busy} disabled={title.trim().length < 3 || brief.trim().length < 10 || !deadline} onClick={create}>Create contest</Button>
        </Card>
      )}

      {list === null ? (
        <div className="grid gap-3 sm:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
      ) : list.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">No contests yet.{canCreate ? " Create the first one." : " Your teacher can start one."}</Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((c) => (
            <Link key={c.id} href={`/studio/contests/${c.id}`}>
              <Card className="p-4 h-full space-y-2 hover:border-teal-500/60 transition-colors">
                <div className="flex items-center gap-2">
                  <Badge variant={c.status === "open" ? "emerald" : "secondary"}>{c.status === "open" ? "Open" : "Closed"}</Badge>
                  <span className="text-xs text-slate-500 ml-auto">{c.status === "open" ? `Ends ${fmt(c.deadline)}` : `Ended ${fmt(c.deadline)}`}</span>
                </div>
                <p className="font-bold leading-tight">{c.title}</p>
                <p className="text-xs text-slate-500 line-clamp-2">{c.brief}</p>
                <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                  <span>Budget <b>{formatNaira(c.budget)}</b></span>
                  <span>{c.entryCount} {c.entryCount === 1 ? "entry" : "entries"}</span>
                  {c.winnerName && (
                    <span className="ml-auto flex items-center gap-1 text-amber-600 font-semibold">
                      <Trophy className="h-3.5 w-3.5" /> {c.winnerName}
                    </span>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
