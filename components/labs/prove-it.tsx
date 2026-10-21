"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ShoppingCart, Wrench } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";

interface LabRow {
  id: string;
  title: string;
  goal: string;
  kind: "circuit" | "mechanism" | "assembly";
  published?: boolean;
  canProve?: boolean;
  myProofDesignId: string | null;
  myProofDone: number;
}

/**
 * "Prove it": rebuild the topic's lab yourself. You begin with an empty bench, shop for every part, place and wire
 * them, write the program, and the Studio checks each step. It replaces "take a quiz" as the way to show you got it.
 */
export function ProveIt({ classId, kcId, topicTitle }: { classId: string; kcId: string; topicTitle: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [labs, setLabs] = useState<LabRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const j = await fetch(`/api/classes/${classId}/kcs/${kcId}/labs`).then((r) => r.json());
      if (j.ok) setLabs(asArray<LabRow>(j.data.labs));
      else setFailed(true);
    } catch {
      setFailed(true);
    }
  }, [classId, kcId]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const start = async (lab: LabRow) => {
    if (lab.myProofDesignId) return router.push(`/studio/${lab.myProofDesignId}`);
    setBusy(lab.id);
    try {
      const j = await fetch(`/api/classes/${classId}/kcs/${kcId}/labs/${lab.id}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proof: true }) }).then((r) => r.json());
      if (j.ok) router.push(`/studio/${j.data.designId}`);
      else toast({ title: "Couldn't start", description: j.error?.message, variant: "destructive" });
    } catch {
      toast({ title: "Couldn't start", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (failed) return <Card className="p-6 text-sm text-slate-500">Couldn&apos;t load the builds for this topic. Please refresh.</Card>;
  if (!labs) return <Skeleton className="h-40 w-full rounded-2xl" />;
  const rebuildable = labs.filter((l) => l.canProve);

  return (
    <div className="space-y-3">
      <Card className="p-4 md:p-5 space-y-1">
        <p className="font-bold flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-teal-600" /> Rebuild it yourself
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Show you understand {topicTitle} by building it from nothing. You start with an empty bench, add each part from the shop, place it, wire it, and write the program. The Studio checks every step as you go.
        </p>
      </Card>

      {rebuildable.length === 0 ? (
        <Card className="p-6 text-center space-y-1">
          <p className="text-3xl" aria-hidden>🧰</p>
          <p className="font-bold">No rebuild challenge for this topic yet</p>
          <p className="text-sm text-slate-500">Your teacher hasn&apos;t added a circuit build here. Use the quiz to check yourself, or open Build &amp; test.</p>
        </Card>
      ) : (
        rebuildable.map((lab) => {
          const done = lab.myProofDone;
          return (
            <Card key={lab.id} className="p-4 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-emerald-600 shrink-0" /> {lab.title}
                  {lab.published === false && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">DRAFT</span>}
                </p>
                {lab.goal && <p className="text-xs text-slate-500 mt-0.5">{lab.goal}</p>}
                {done > 0 && (
                  <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {done} step{done === 1 ? "" : "s"} done
                  </p>
                )}
              </div>
              <Button size="sm" onClick={() => start(lab)} isLoading={busy === lab.id}>
                {lab.myProofDesignId ? "Continue building" : "Start from an empty bench"}
              </Button>
            </Card>
          );
        })
      )}
    </div>
  );
}
