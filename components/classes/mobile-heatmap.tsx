"use client";

import React from "react";
import { Card } from "@/components/ui/card";

interface Cell {
  pL: number;
  attempts: number;
  correct: number;
}
interface Kc {
  id: string;
  title: string;
  averagePL: number;
  pL0: number;
}
interface Student {
  uid: string;
  displayName: string;
  averagePL: number;
  masteredCount: number;
  kcs: Record<string, Cell | undefined>;
}

/**
 * The class heatmap for phones. The wide table needs a pinned name column and sideways scrolling, which leaves almost no room for the
 * actual map on a small screen. Here each student is a card: their name and overall score on top, then one tile per topic that wraps
 * onto as many lines as it needs. Nothing scrolls sideways; the topic key below says what each number means.
 */
export function MobileHeatmap({ students, kcs, cellClass, onOpen }: { students: Student[]; kcs: Kc[]; cellClass: (pL: number) => string; onOpen: (s: Student) => void }) {
  return (
    <div className="space-y-3 md:hidden">
      <details className="group rounded-lg border border-border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
          <span>Topic key ({kcs.length})</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground group-open:hidden">Show</span>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground group-open:inline">Hide</span>
        </summary>
        <ol className="divide-y divide-border border-t border-border">
          {kcs.map((kc, i) => (
            <li key={kc.id} className="flex items-baseline gap-3 px-4 py-2 text-sm">
              <span className="w-6 shrink-0 font-mono text-xs text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1">{kc.title}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">avg {(kc.averagePL * 100).toFixed(0)}%</span>
            </li>
          ))}
        </ol>
      </details>

      {students.map((st) => (
        <Card key={st.uid} className="space-y-3 p-3">
          <button type="button" onClick={() => onOpen(st)} className="flex w-full items-center gap-3 text-left">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600/10 text-sm font-semibold text-brand-700 dark:text-brand-300">{st.displayName[0]?.toUpperCase() || "S"}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{st.displayName}</span>
              <span className="block text-xs text-muted-foreground">
                {st.masteredCount} of {kcs.length} mastered
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-mono text-base font-semibold">{(st.averagePL * 100).toFixed(0)}%</span>
              <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">overall</span>
            </span>
          </button>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-1.5">
            {kcs.map((kc, i) => {
              const cell = st.kcs[kc.id] ?? { pL: kc.pL0, attempts: 0, correct: 0 };
              return (
                <button
                  key={kc.id}
                  type="button"
                  onClick={() => onOpen(st)}
                  aria-label={`${st.displayName}, topic ${i + 1}, ${kc.title}: ${(cell.pL * 100).toFixed(0)} percent`}
                  className={`flex h-12 flex-col items-center justify-center rounded-md border text-xs font-semibold leading-none ${cellClass(cell.pL)}`}
                >
                  <span>{(cell.pL * 100).toFixed(0)}%</span>
                  <span className="mt-1 font-mono text-[9px] font-normal opacity-70">#{i + 1}</span>
                </button>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}
