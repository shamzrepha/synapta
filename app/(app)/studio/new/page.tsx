"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BadgeCheck, ExternalLink, Loader2, Minus, Plus, Search, Sparkles, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { PartShop, addToTray, useShop, useTray, type TrayItem } from "@/components/studio/part-shop";
import { asArray } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface Plan {
  title: string;
  summary: string;
  approach: string[];
  parts: Array<{ type: string; qty: number; why: string }>;
  notInShop: string[];
  warnings: string[];
}
interface Research {
  notes: string;
  sources: Array<{ title: string; uri: string }>;
}

/**
 * Plan → choose parts → build. The AI proposes a bill of materials from the shop, the learner edits it
 * (add from the shop, change quantities), optionally lets the AI research how to do it, and the build
 * uses exactly those parts with their datasheet facts attached.
 */
export default function NewBuildPage() {
  const router = useRouter();
  const { toast } = useToast();
  const shop = useShop();
  const [tray, setTray] = useTray();
  const [prompt, setPrompt] = useState(() => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("prompt") || ""));
  const [level, setLevel] = useState("beginner");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [why, setWhy] = useState<Record<string, string>>({});
  const [planning, setPlanning] = useState(false);
  const [research, setResearch] = useState<Research | null>(null);
  const [researching, setResearching] = useState(false);
  const [building, setBuilding] = useState(false);
  const [picking, setPicking] = useState(false);

  const nameOf = (type: string) => shop?.items.find((i) => i.type === type)?.name || type;
  const verifiedOf = (type: string) => !!shop?.items.find((i) => i.type === type)?.verified;
  const costOf = (type: string) => shop?.items.find((i) => i.type === type)?.cost || "";

  const doPlan = async () => {
    if (prompt.trim().length < 4) return;
    setPlanning(true);
    setResearch(null);
    try {
      const j = await fetch("/api/studio/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: prompt.trim(), level }) }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error?.message || "The AI couldn't plan this");
      const p = j.data.plan as Plan;
      setPlan({ ...p, parts: asArray(p.parts), approach: asArray(p.approach), notInShop: asArray(p.notInShop), warnings: asArray(p.warnings) });
      setTray(asArray<Plan["parts"][number]>(p.parts).map((x) => ({ type: x.type, qty: x.qty })));
      setWhy(Object.fromEntries(asArray<Plan["parts"][number]>(p.parts).map((x) => [x.type, x.why])));
    } catch (e) {
      toast({ title: "Couldn't plan the parts", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setPlanning(false);
    }
  };

  const doResearch = async () => {
    setResearching(true);
    try {
      const j = await fetch("/api/studio/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: prompt.trim(), parts: tray }) }).then((r) => r.json());
      if (j.ok && j.data.research) setResearch({ notes: j.data.research.notes, sources: asArray(j.data.research.sources) });
      else toast({ title: "No research came back", description: "You can still build; the AI will use the datasheet facts.", variant: "amber" });
    } catch {
      toast({ title: "Research failed", variant: "amber" });
    } finally {
      setResearching(false);
    }
  };

  const build = async () => {
    setBuilding(true);
    try {
      const j = await fetch("/api/studio/designs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: "prompt", prompt: prompt.trim(), level, parts: tray, research: research || undefined, title: plan?.title }),
      }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error?.message || "The build failed");
      router.push(`/studio/${j.data.id}`);
    } catch (e) {
      toast({ title: "Couldn't build it", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
      setBuilding(false);
    }
  };

  const total = tray.reduce((n, t) => n + t.qty, 0);
  const setQty = (t: TrayItem, by: number) => setTray(addToTray(tray, t.type, by));
  useEffect(() => {
    document.title = "Plan a build · Maker Studio";
  }, []);

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center gap-2">
        <Link href="/studio" className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="Back to Maker Studio"><ArrowLeft className="h-4 w-4" /></Link>
        <div>
          <p className="text-xs font-mono tracking-widest text-teal-600">MAKER SPACE</p>
          <h1 className="text-xl font-extrabold">Plan a build</h1>
        </div>
        <Link href="/studio/shop" className="ml-auto text-xs font-semibold text-teal-600 flex items-center gap-1"><Wrench className="h-3.5 w-3.5" /> Parts shop</Link>
      </div>

      <Card className="p-4 space-y-3">
        <p className="font-bold text-sm">1 · What do you want to build?</p>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} maxLength={1500} placeholder="e.g. a line-following car, an automatic gate that opens when something comes close, a robot that avoids obstacles…" className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm" />
        <div className="flex flex-wrap items-center gap-2">
          <select value={level} onChange={(e) => setLevel(e.target.value)} className="h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm" aria-label="Level">
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
          <Button onClick={doPlan} isLoading={planning} disabled={prompt.trim().length < 4}><Sparkles className="h-4 w-4 mr-1" /> {plan ? "Plan again" : "Plan the parts with AI"}</Button>
          <span className="text-xs text-slate-500">or pick parts yourself below.</span>
        </div>
      </Card>

      {plan && (
        <Card className="p-4 space-y-2">
          <p className="font-extrabold">{plan.title}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">{plan.summary}</p>
          {plan.approach.length > 0 && (
            <ol className="list-decimal pl-5 text-sm space-y-0.5">{plan.approach.map((a, i) => <li key={i}>{a}</li>)}</ol>
          )}
          {plan.warnings.map((w, i) => <p key={i} className="text-xs rounded-lg bg-amber-500/10 px-2 py-1 text-amber-800 dark:text-amber-300">{w}</p>)}
          {plan.notInShop.length > 0 && <p className="text-xs rounded-lg bg-sky-500/10 px-2 py-1">Not in the shop yet: {plan.notInShop.join(", ")}.</p>}
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <p className="font-bold text-sm">2 · Your parts ({total})</p>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setPicking((p) => !p)}><Plus className="h-4 w-4 mr-1" /> {picking ? "Close shop" : "Add from shop"}</Button>
        </div>
        {tray.length === 0 && <p className="text-sm text-slate-500">Nothing yet. Let the AI plan it, or open the shop.</p>}
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {tray.map((t) => (
            <li key={t.type} className="py-2 flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold flex items-center gap-1">{nameOf(t.type)} {verifiedOf(t.type) && <BadgeCheck className="h-3.5 w-3.5 text-emerald-500" aria-label="Datasheet-verified" />} <span className="text-xs font-normal text-slate-500">{costOf(t.type)}</span></p>
                {why[t.type] && <p className="text-xs text-slate-500">{why[t.type]}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" aria-label="One fewer" onClick={() => setQty(t, -1)} className="h-7 w-7 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center"><Minus className="h-3.5 w-3.5" /></button>
                <span className="w-6 text-center text-sm font-bold">{t.qty}</span>
                <button type="button" aria-label="One more" onClick={() => setQty(t, 1)} className="h-7 w-7 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center"><Plus className="h-3.5 w-3.5" /></button>
                <button type="button" aria-label="Remove" onClick={() => setTray(tray.filter((x) => x.type !== t.type))} className="h-7 w-7 rounded-lg text-slate-400 hover:text-rose-600 flex items-center justify-center"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </li>
          ))}
        </ul>
        {picking && <PartShop tray={tray} onTray={setTray} />}
      </Card>

      <Card className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <p className="font-bold text-sm">3 · Research (optional)</p>
          <Button size="sm" variant="outline" className="ml-auto" onClick={doResearch} isLoading={researching} disabled={prompt.trim().length < 4 || tray.length === 0}><Search className="h-4 w-4 mr-1" /> Research how to build it</Button>
        </div>
        <p className="text-xs text-slate-500">The AI searches the web for how makers build this, and cites what it read. The datasheet facts always win over web advice.</p>
        {researching && <p className="text-xs flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Researching…</p>}
        {research && (
          <div className="space-y-1">
            <pre className="whitespace-pre-wrap text-xs rounded-xl bg-slate-100 dark:bg-slate-900 p-3">{research.notes}</pre>
            {research.sources.length > 0 && (
              <ul className="text-xs space-y-0.5">{research.sources.map((s) => <li key={s.uri}><a href={s.uri} target="_blank" rel="noreferrer" className="text-teal-600 inline-flex items-center gap-1">{s.title || s.uri}<ExternalLink className="h-3 w-3" /></a></li>)}</ul>
            )}
          </div>
        )}
      </Card>

      <div className={cn("sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-3 z-30")}>
        <Button className="w-full h-12 text-base bg-teal-600 hover:bg-teal-700" onClick={build} isLoading={building} disabled={prompt.trim().length < 4 || tray.length === 0}>
          <Sparkles className="h-5 w-5 mr-2" /> Build it with these {total} part{total === 1 ? "" : "s"}
        </Button>
        {building && <p className="text-center text-xs text-slate-500 mt-1">The AI is wiring, coding and testing it in the simulator — this can take up to a minute.</p>}
      </div>
    </div>
  );
}
