"use client";

import React, { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ThumbsUp, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { useUserStore } from "@/lib/store/use-user-store";
import { formatNaira } from "@/lib/studio/bom";
import { CATALOG_BY_TYPE } from "@/lib/studio/circuit/catalog";
import type { ContestView } from "@/lib/studio/contest-server";

interface Entry {
  uid: string;
  designId: string;
  title: string;
  ownerName: string;
  cost: number;
  votes: number;
  mine: boolean;
  rank: number;
  winner: boolean;
}
interface Payload {
  contest: ContestView;
  entries: Entry[];
  myVote: string | null;
  canManage: boolean;
}
interface MyDesign {
  id: string;
  title: string;
  kind: string;
  ownerUid: string;
}

export default function ContestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast } = useToast();
  const uid = useUserStore((s) => s.user?.uid);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<MyDesign[]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const j = await fetch(`/api/studio/contests/${id}`).then((r) => r.json());
      if (j.ok) setData(j.data);
      else setError(j.error?.message || "Couldn't open this contest.");
    } catch {
      setError("Couldn't open this contest.");
    }
  }, [id]);

  useEffect(() => {
    // async: setState happens after the fetch resolves
    const t = setTimeout(load, 0);
    fetch("/api/studio/designs?scope=mine")
      .then((r) => r.json())
      .then((j) => j.ok && setMine(asArray<MyDesign>(j.data.designs)))
      .catch(() => null);
    return () => clearTimeout(t);
  }, [load]);

  if (error) {
    return (
      <Card className="p-8 text-center text-sm space-y-3">
        <p>{error}</p>
        <Link href="/studio/contests" className="text-teal-600 font-semibold">All contests</Link>
      </Card>
    );
  }
  if (!data) return <Skeleton className="h-96 rounded-2xl" />;
  const { contest: c, entries, myVote } = data;
  const open = c.status === "open";
  const myEntry = entries.find((e) => e.mine);
  const myDesigns = mine.filter((d) => d.ownerUid === uid);

  const enter = async () => {
    setBusy(true);
    setProblems([]);
    try {
      const j = await fetch(`/api/studio/contests/${id}/enter`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ designId: pick }) }).then((r) => r.json());
      if (j.ok) {
        toast({ title: "You're in!", description: `Your parts cost ${formatNaira(j.data.cost)}.` });
        await load();
      } else {
        setProblems(asArray<string>(j.error?.details?.problems).length ? j.error.details.problems : [j.error?.message || "Couldn't enter."]);
      }
    } catch {
      toast({ title: "Couldn't enter", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  const vote = async (entryUid: string) => {
    const j = await fetch(`/api/studio/contests/${id}/vote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryUid }) }).then((r) => r.json()).catch(() => null);
    if (j?.ok) await load();
    else toast({ title: "Couldn't vote", description: j?.error?.message, variant: "destructive" });
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <Link href="/studio/contests" className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="All contests">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-extrabold leading-tight flex-1 min-w-0">{c.title}</h1>
        <Badge variant={open ? "emerald" : "secondary"}>{open ? "Open" : "Closed"}</Badge>
      </div>

      <Card className="p-4 space-y-3">
        <p className="text-sm whitespace-pre-wrap">{c.brief}</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-slate-500">Parts budget</p><p className="font-extrabold">{formatNaira(c.budget)}</p></div>
          <div><p className="text-xs text-slate-500">{open ? "Deadline" : "Ended"}</p><p className="font-extrabold">{new Date(c.deadline).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p></div>
        </div>
        <p className="text-xs text-slate-500">
          Allowed parts:{" "}
          {c.allowedParts.length ? c.allowedParts.map((t) => CATALOG_BY_TYPE[t]?.name.replace(/ \(.*\)$/, "") || t).join(", ") + " (plus board, resistor, LED, button, switch)" : "any shop part"}
          . Set by {c.createdByName}.
        </p>
      </Card>

      {!open && c.winnerName && (
        <Card className="p-4 flex items-center gap-3 border-amber-400/60 bg-amber-400/10">
          <Trophy className="h-8 w-8 text-amber-500 shrink-0" />
          <div>
            <p className="font-extrabold">Winner: {c.winnerName}</p>
            {c.winnerDesignId && <Link href={`/studio/${c.winnerDesignId}`} className="text-xs font-semibold text-teal-600">See the winning design</Link>}
          </div>
        </Card>
      )}

      {open && !myEntry && (
        <Card className="p-4 space-y-3">
          <h2 className="font-extrabold">Enter a design</h2>
          {myDesigns.length === 0 ? (
            <p className="text-sm text-slate-500">You have no designs yet. <Link href="/studio" className="text-teal-600 font-semibold">Build one in the Studio</Link>.</p>
          ) : (
            <>
              <select value={pick} onChange={(e) => setPick(e.target.value)} className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm" aria-label="Your design">
                <option value="">Choose one of your designs…</option>
                {myDesigns.map((d) => (
                  <option key={d.id} value={d.id}>{d.title}</option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">The server prices your circuit from the shop and checks the allowed parts and your design&apos;s own step checks. Entering makes the design public so others can vote. You get one entry.</p>
              <Button isLoading={busy} disabled={!pick} onClick={enter}>Enter contest</Button>
            </>
          )}
          {problems.length > 0 && (
            <ul className="rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-300 text-sm p-3 list-disc pl-6 space-y-1">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <section className="space-y-2">
        <h2 className="font-extrabold">Leaderboard</h2>
        {entries.length === 0 ? (
          <Card className="p-6 text-center text-sm text-slate-500">No entries yet.</Card>
        ) : (
          entries.map((e) => (
            <Card key={e.uid} className="p-3 flex items-center gap-3">
              <span className="w-7 text-center font-extrabold text-slate-500">{e.winner ? <Trophy className="h-5 w-5 text-amber-500 mx-auto" /> : `#${e.rank}`}</span>
              <div className="min-w-0 flex-1">
                <Link href={`/studio/${e.designId}`} className="font-bold leading-tight block truncate hover:underline">{e.title}</Link>
                <p className="text-xs text-slate-500 truncate">{e.ownerName}{e.mine ? " (you)" : ""} · parts {formatNaira(e.cost)}</p>
              </div>
              <span className="text-sm font-extrabold tabular-nums">{e.votes}</span>
              {open && !e.mine && (
                <Button size="sm" variant={myVote === e.uid ? "default" : "outline"} disabled={!!myVote} onClick={() => vote(e.uid)} aria-label={`Vote for ${e.title}`}>
                  <ThumbsUp className="h-4 w-4" />
                </Button>
              )}
            </Card>
          ))
        )}
        {open && myVote && <p className="text-xs text-slate-500">You have used your vote.</p>}
      </section>
    </div>
  );
}
