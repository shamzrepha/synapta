"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wrench, Cpu, Cog, Box, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface ClassLab {
  id: string;
  title: string;
  goal: string;
  kind: "circuit" | "mechanism" | "assembly";
  stepCount: number;
  dueAt: string | null;
  kcId: string;
  kcTitle: string;
  myDesignId: string | null;
  myDone: number;
  started: number;
  finished: number;
}

const ICON = { circuit: <Cpu className="h-4 w-4 text-emerald-600" />, mechanism: <Cog className="h-4 w-4 text-amber-600" />, assembly: <Box className="h-4 w-4 text-sky-600" /> };

async function fetchLabs(classId: string) {
  try {
    const j = await fetch(`/api/classes/${classId}/labs`).then((r) => r.json());
    return j.ok ? { labs: asArray<ClassLab>(j.data.labs), canManage: !!j.data.canManage } : null;
  } catch {
    return null;
  }
}

/** Hands-on build assignments (topic labs with due dates) shown next to written assignments. */
export function ClassBuildAssignments({ classId }: { classId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = useState<{ labs: ClassLab[]; canManage: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchLabs(classId).then(setData);
  }, [classId]);

  if (!data || data.labs.length === 0) return null;

  const start = async (lab: ClassLab) => {
    if (lab.myDesignId) return router.push(`/studio/${lab.myDesignId}`);
    setBusy(lab.id);
    try {
      const j = await fetch(`/api/classes/${classId}/kcs/${lab.kcId}/labs/${lab.id}/start`, { method: "POST" }).then((r) => r.json());
      if (j.ok) router.push(`/studio/${j.data.designId}`);
      else toast({ title: "Couldn't start the lab", description: j.error?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const sorted = [...data.labs].sort((a, b) => (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity));
  return (
    <section className="space-y-3">
      <h2 className="font-extrabold text-lg flex items-center gap-2">
        <Wrench className="h-5 w-5 text-teal-600" /> Build assignments
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map((lab) => {
          const complete = lab.stepCount > 0 && lab.myDone >= lab.stepCount;
          const overdue = !complete && lab.dueAt && new Date(lab.dueAt) < new Date();
          return (
            <Card key={`${lab.kcId}-${lab.id}`} className={cn("p-4 space-y-2", complete && "border-emerald-500/40")}>
              <p className="font-bold flex items-center gap-1.5">{ICON[lab.kind]} {lab.title}</p>
              <p className="text-[11px] text-slate-500">
                <Link href={`/classes/${classId}/topics/${lab.kcId}?tab=build`} className="underline">{lab.kcTitle}</Link>
                {lab.dueAt && (
                  <span className={cn("ml-2 font-bold", overdue ? "text-rose-600" : "text-amber-600")}>
                    {overdue ? "OVERDUE" : "DUE"} {new Date(lab.dueAt).toLocaleDateString()}
                  </span>
                )}
              </p>
              {lab.goal && <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">{lab.goal}</p>}
              {data.canManage ? (
                <p className="text-xs text-slate-500">{lab.started} started · {lab.finished} finished</p>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-teal-500" style={{ width: `${(lab.myDone / Math.max(1, lab.stepCount)) * 100}%` }} />
                  </div>
                  <span className="text-[11px] text-slate-500">{lab.myDone}/{lab.stepCount}</span>
                  {complete && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                </div>
              )}
              {!data.canManage && (
                <Button size="sm" className="w-full" onClick={() => start(lab)} isLoading={busy === lab.id}>
                  {lab.myDesignId ? (complete ? "Open" : "Continue") : "Start build"}
                </Button>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
