"use client";

import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckSquare, Square, Wrench, PlayCircle, ShieldAlert, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { StepVideos } from "@/components/studio/videos";
import { asArray } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface Stage {
  id: string;
  title: string;
  why: string;
  learn: string[];
  videoQuery: string;
  checklist: string[];
  templateId: string | null;
  buildPrompt: string | null;
}

interface PathDoc {
  id: string;
  goal: string;
  title: string;
  summary: string;
  stages: Stage[];
  parts: Array<{ name: string; qty: number; estCost: string; substitute: string }>;
  safety: string;
  done: Record<string, boolean>;
  designs: Record<string, string>;
}

async function fetchPath(id: string): Promise<PathDoc | null> {
  try {
    const j = await fetch(`/api/studio/paths/${id}`).then((r) => r.json());
    return j.ok ? (j.data.path as PathDoc) : null;
  } catch {
    return null;
  }
}

export default function PathPage({ params }: { params: Promise<{ pathId: string }> }) {
  const { pathId } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const [path, setPath] = useState<PathDoc | null | "missing">(null);
  const [videos, setVideos] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchPath(pathId).then((p) => setPath(p || "missing"));
  }, [pathId]);

  if (path === null) return <Skeleton className="h-96 rounded-2xl" />;
  if (path === "missing") return <Card className="p-8 text-center">Path not found. <Link href="/studio/path" className="text-teal-600 underline">Back</Link></Card>;

  const tick = async (key: string, done: boolean) => {
    setPath({ ...path, done: { ...path.done, [key.replace(":", "_")]: done } });
    await fetch(`/api/studio/paths/${pathId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, done }) }).catch(() => null);
  };

  const build = async (stage: Stage) => {
    setBusy(stage.id);
    try {
      const j = await fetch(`/api/studio/paths/${pathId}/stage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stageId: stage.id }) }).then((r) => r.json());
      if (j.ok) router.push(`/studio/${j.data.designId}`);
      else toast({ title: "Couldn't open the build", description: j.error?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const total = path.stages.reduce((n, s) => n + s.checklist.length, 0);
  const done = Object.values(path.done || {}).filter(Boolean).length;
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <Link href="/studio/path" className="inline-flex items-center gap-1 text-xs text-slate-500"><ArrowLeft className="h-3.5 w-3.5" /> My paths</Link>
      <div>
        <p className="text-xs text-slate-500">Goal: {path.goal}</p>
        <h1 className="text-2xl font-extrabold">{path.title}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{path.summary}</p>
        <div className="mt-2 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div className="h-full bg-teal-500 transition-all" style={{ width: `${(done / Math.max(1, total)) * 100}%` }} />
        </div>
        <p className="text-xs text-slate-500 mt-1">{done}/{total} checklist items</p>
      </div>

      <ol className="space-y-3">
        {path.stages.map((s, i) => {
          const items = s.checklist.map((c, k) => ({ c, key: `${s.id}:${k}`, on: !!path.done?.[`${s.id}_${k}`] }));
          const complete = items.every((x) => x.on);
          return (
            <li key={s.id}>
              <Card className={cn("p-4 space-y-2", complete && "border-emerald-500/40")}>
                <p className="font-bold">{i + 1}. {s.title}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">{s.why}</p>
                {s.learn.length > 0 && <p className="text-xs"><b>Learn:</b> {s.learn.join(" · ")}</p>}
                <ul className="space-y-1">
                  {items.map((x) => (
                    <li key={x.key}>
                      <button type="button" onClick={() => tick(x.key, !x.on)} className="flex items-start gap-2 text-sm text-left">
                        {x.on ? <CheckSquare className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" /> : <Square className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />}
                        <span className={cn(x.on && "line-through text-slate-400")}>{x.c}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => build(s)} isLoading={busy === s.id}>
                    <Wrench className="h-4 w-4 mr-1" /> {path.designs?.[s.id] ? "Continue build" : "Build it in the studio"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setVideos(videos === s.id ? null : s.id)}>
                    <PlayCircle className="h-4 w-4 mr-1 text-rose-600" /> {videos === s.id ? "Hide videos" : "Videos"}
                  </Button>
                </div>
                {videos === s.id && <StepVideos query={s.videoQuery} />}
              </Card>
            </li>
          );
        })}
      </ol>

      {asArray(path.parts).length > 0 && (
        <Card className="p-4 space-y-2">
          <p className="font-bold flex items-center gap-1.5"><Package className="h-4 w-4" /> Parts for the real build</p>
          <p className="text-xs text-slate-500">Simulate everything first — buy parts only when you&apos;re ready.</p>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {asArray<PathDoc["parts"][number]>(path.parts).map((p) => (
              <li key={p.name} className="py-1.5 text-sm flex flex-wrap gap-x-3">
                <span className="font-semibold">{p.qty} × {p.name}</span>
                <span className="text-slate-500">{p.estCost}</span>
                {p.substitute && <span className="text-xs text-slate-500 w-full">Cheaper: {p.substitute}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {path.safety && (
        <Card className="p-4 text-sm flex gap-2 bg-amber-500/5">
          <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" /> {path.safety}
        </Card>
      )}
    </div>
  );
}
