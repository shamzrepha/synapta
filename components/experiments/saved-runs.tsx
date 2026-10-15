"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { columnLabel, experimentById } from "@/lib/experiments/defs";

export interface SavedRun {
  id: string;
  experiment: string;
  title: string;
  note: string;
  rows: Array<Record<string, number>>;
  solved: string[];
  createdAt: string | null;
}

/** The student's saved runs (all, or one experiment), each expandable into its data table. `refreshKey` reloads after a save. */
export function SavedRuns({ experiment, refreshKey = 0 }: { experiment?: string; refreshKey?: number }) {
  const { toast } = useToast();
  const [runs, setRuns] = useState<SavedRun[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/experiments/runs${experiment ? `?experiment=${experiment}` : ""}`)
      .then((r) => r.json())
      .then((j) => setRuns(j.ok ? asArray<SavedRun>(j.data.runs) : []))
      .catch(() => setRuns([]));
  }, [experiment]);
  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const remove = async (id: string) => {
    const j = await fetch(`/api/experiments/runs?id=${id}`, { method: "DELETE" }).then((r) => r.json());
    if (j.ok) setRuns((rs) => (rs || []).filter((r) => r.id !== id));
    else toast({ title: "Couldn't delete", description: j.error?.message, variant: "destructive" });
  };

  if (runs === null) return <Skeleton className="h-16 w-full" />;
  if (!runs.length) return <p className="text-xs text-slate-500">No saved runs yet. Record some rows and press Save.</p>;
  return (
    <div className="space-y-2">
      {runs.map((r) => {
        const e = experimentById(r.experiment);
        const cols = e ? e.recordKeys.filter((k) => r.rows.some((row) => k in row)) : [];
        return (
          <Card key={r.id} className="p-3">
            <div className="flex items-center gap-2">
              <button type="button" className="flex-1 min-w-0 text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
                <p className="text-sm font-semibold truncate">{e?.emoji} {r.title}</p>
                <p className="text-[11px] text-slate-500">{r.rows.length} row{r.rows.length === 1 ? "" : "s"} · {r.solved.length} question{r.solved.length === 1 ? "" : "s"} solved · {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ""}</p>
              </button>
              {!experiment && e && <Link href={`/experiments/${e.id}`} className="text-xs font-semibold text-teal-600">Open</Link>}
              <button type="button" onClick={() => remove(r.id)} aria-label="Delete run" className="h-9 w-9 rounded-lg flex items-center justify-center text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"><Trash2 className="h-4 w-4" /></button>
            </div>
            {open === r.id && e && (
              <div className="mt-2 space-y-1">
                {r.note && <p className="text-xs">{r.note}</p>}
                <div className="overflow-x-auto">
                  <table className="text-[11px] w-full">
                    <thead><tr>{cols.map((k) => <th key={k} className="text-left font-semibold pr-3 whitespace-nowrap">{columnLabel(e, k)}</th>)}</tr></thead>
                    <tbody>{r.rows.map((row, i) => <tr key={i}>{cols.map((k) => <td key={k} className="pr-3 font-mono">{row[k] ?? ""}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
