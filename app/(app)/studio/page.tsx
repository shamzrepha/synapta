"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Cpu, Cog, Box, Plus, Route, Swords, Globe2, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { DesignTile, type DesignCard } from "@/components/studio/design-tile";


interface TemplateCard {
  id: string;
  title: string;
  kind: "circuit" | "mechanism" | "assembly";
  level: string;
  tags: string[];
  blurb: string;
  guided: boolean;
}

const KIND: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  circuit: { icon: <Cpu className="h-4 w-4" />, label: "Circuit + code", color: "text-emerald-600" },
  mechanism: { icon: <Cog className="h-4 w-4" />, label: "Mechanism", color: "text-amber-600" },
  assembly: { icon: <Box className="h-4 w-4" />, label: "3D assembly", color: "text-sky-600" },
};

async function fetchList(scope: string, sort = ""): Promise<DesignCard[] | null> {
  try {
    const j = await fetch(`/api/studio/designs?scope=${scope}${sort ? `&sort=${sort}` : ""}`).then((r) => r.json());
    return j.ok ? asArray<DesignCard>(j.data.designs) : null;
  } catch {
    return null;
  }
}

async function fetchTemplates(): Promise<TemplateCard[]> {
  try {
    const j = await fetch("/api/studio/templates").then((r) => r.json());
    return j.ok ? asArray<TemplateCard>(j.data.templates) : [];
  } catch {
    return [];
  }
}

export default function StudioHome() {
  const router = useRouter();
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<"" | "circuit" | "mechanism" | "assembly">("");
  const [level, setLevel] = useState("beginner");
  const [creating, setCreating] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateCard[] | null>(null);
  const [tab, setTab] = useState<"mine" | "world">("mine");
  const [sort, setSort] = useState<"" | "top">("");
  const [list, setList] = useState<DesignCard[] | null>(null);

  useEffect(() => {
    fetchTemplates().then(setTemplates);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setList(null), 0);
    fetchList(tab === "mine" ? "mine" : "public", tab === "world" ? sort : "").then((l) => setList(l || []));
    return () => clearTimeout(t);
  }, [tab, sort]);

  const create = async (body: Record<string, unknown>, key: string) => {
    setCreating(key);
    try {
      const j = await fetch("/api/studio/designs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
      if (j.ok) router.push(`/studio/${j.data.id}`);
      else toast({ title: "Couldn't create the design", description: j.error?.message, variant: "destructive" });
    } catch {
      toast({ title: "Couldn't create the design", variant: "destructive" });
    } finally {
      setCreating(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-br from-[#0b2a5b] via-[#0c3a73] to-teal-800 text-white p-5 md:p-8 space-y-4">
        <div>
          <p className="text-xs font-mono tracking-widest text-amber-300">MAKER STUDIO</p>
          <h1 className="text-2xl md:text-3xl font-extrabold mt-1">Build it, simulate it, code it, test it — no parts needed.</h1>
          <p className="text-sm text-sky-100/80 mt-1 max-w-2xl">Wire circuits and program them, design gear trains that lift real loads under gravity, or model 3D assemblies. Every change is saved like Git, and you can remix anyone&apos;s design.</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (prompt.trim().length >= 4) create({ from: "prompt", prompt: prompt.trim(), kind: kind || undefined, level }, "prompt");
          }}
          className="space-y-2"
        >
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            maxLength={1500}
            placeholder="Describe what you want to build… e.g. “a traffic light with a pedestrian button”, “a gearbox that lifts 10 kg with a hand crank”, “a phone stand with adjustable angle”"
            className="w-full rounded-2xl bg-white/95 text-slate-900 px-4 py-3 text-sm placeholder:text-slate-500 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            {(["", "circuit", "mechanism", "assembly"] as const).map((k) => (
              <button key={k || "auto"} type="button" onClick={() => setKind(k)} className={cn("rounded-full px-3 py-1 text-xs font-semibold border", kind === k ? "bg-white text-slate-900 border-white" : "border-white/40 text-white")}>
                {k ? KIND[k].label : "AI decides"}
              </button>
            ))}
            <select value={level} onChange={(e) => setLevel(e.target.value)} className="h-8 rounded-full bg-white/10 border border-white/40 px-3 text-xs" aria-label="Level">
              <option value="beginner" className="text-slate-900">Beginner</option>
              <option value="intermediate" className="text-slate-900">Intermediate</option>
              <option value="advanced" className="text-slate-900">Advanced</option>
            </select>
            <Button type="submit" className="ml-auto bg-amber-400 text-slate-900 hover:bg-amber-300" isLoading={creating === "prompt"} disabled={prompt.trim().length < 4}>
              <Sparkles className="h-4 w-4 mr-1" /> Design it with AI
            </Button>
          </div>
        </form>
        <div className="flex flex-wrap gap-2 text-xs">
          {(["circuit", "mechanism", "assembly"] as const).map((k) => (
            <button key={k} type="button" onClick={() => create({ from: "blank", kind: k }, `blank-${k}`)} className="flex items-center gap-1 rounded-full border border-white/30 px-3 py-1 hover:bg-white/10">
              <Plus className="h-3 w-3" /> Blank {KIND[k].label.toLowerCase()}
            </button>
          ))}
          <Link href="/studio/path" className="flex items-center gap-1 rounded-full border border-white/30 px-3 py-1 hover:bg-white/10">
            <Route className="h-3 w-3" /> Goal → learning path
          </Link>
          <Link href="/challenges" className="flex items-center gap-1 rounded-full border border-white/30 px-3 py-1 hover:bg-white/10">
            <Swords className="h-3 w-3" /> Build challenges
          </Link>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="font-extrabold text-lg">Start a guided build</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates === null
            ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)
            : templates.map((t) => (
                <Card key={t.id} className="p-4 flex flex-col gap-2">
                  <div className={cn("flex items-center gap-1.5 text-xs font-semibold", KIND[t.kind].color)}>
                    {KIND[t.kind].icon} {KIND[t.kind].label}
                    <Badge variant="outline" className="ml-auto text-[10px] capitalize">{t.level}</Badge>
                  </div>
                  <p className="font-bold">{t.title}</p>
                  <p className="text-xs text-slate-500 flex-1">{t.blurb}</p>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" isLoading={creating === `t-${t.id}`} onClick={() => create({ from: "template", templateId: t.id, guided: true }, `t-${t.id}`)}>
                      {t.guided ? "Build step by step" : "Open"}
                    </Button>
                    {t.guided && (
                      <Button size="sm" variant="outline" isLoading={creating === `f-${t.id}`} onClick={() => create({ from: "template", templateId: t.id, guided: false }, `f-${t.id}`)}>
                        See finished
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 dark:border-slate-800 p-0.5 text-sm font-semibold">
            <button type="button" onClick={() => setTab("mine")} className={cn("px-3 py-1.5 rounded-lg flex items-center gap-1", tab === "mine" ? "bg-teal-600 text-white" : "text-slate-500")}>
              <FolderOpen className="h-4 w-4" /> My designs
            </button>
            <button type="button" onClick={() => setTab("world")} className={cn("px-3 py-1.5 rounded-lg flex items-center gap-1", tab === "world" ? "bg-teal-600 text-white" : "text-slate-500")}>
              <Globe2 className="h-4 w-4" /> Maker World
            </button>
          </div>
          {tab === "world" && (
            <select value={sort} onChange={(e) => setSort(e.target.value as "" | "top")} className="h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-sm" aria-label="Sort">
              <option value="">Newest</option>
              <option value="top">Most starred</option>
            </select>
          )}
        </div>
        {list === null ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
        ) : list.length === 0 ? (
          <Card className="p-8 text-center text-sm text-slate-500">
            {tab === "mine" ? "No designs yet — start a guided build above or describe your idea to the AI." : "No public designs yet. Make one of yours public from its Share tab."}
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((d) => (
              <DesignTile key={d.id} d={d} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
