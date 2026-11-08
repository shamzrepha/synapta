"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, FlaskConical, Flag } from "lucide-react";
import { classProgress, isMastered, isStarted, MASTERED, percent, recommendNext, SOLID, WEAK, type MapTopic } from "@/lib/classes/recommend-next";
import { cn } from "@/lib/utils";

export interface MapItem extends MapTopic {
  title: string;
  description: string;
  labType?: string;
  objectives?: string[];
}

const ROW = 150;
const TOP = 84;
const NODE = 64;

/** x position, in percent of the map's width, of the nth node: a gentle winding path. */
const xAt = (i: number) => 50 + 21 * Math.sin(i * 1.05);

function look(t: MapTopic): string {
  if (!isStarted(t)) return "bg-card border-dashed border-slate-400 text-muted-foreground dark:border-slate-500";
  if (t.pL >= MASTERED) return "bg-brand-700 border-brand-800 text-white dark:bg-brand-500 dark:border-brand-400";
  if (t.pL >= SOLID) return "bg-brand-200 border-brand-300 text-brand-950 dark:bg-brand-400/35 dark:border-brand-400/50 dark:text-brand-100";
  if (t.pL >= WEAK) return "bg-slate-100 border-slate-300 text-slate-800 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100";
  return "cell-hatch bg-orange-100 border-orange-400 text-orange-950 dark:bg-orange-500/20 dark:border-orange-400/60 dark:text-orange-100";
}

function stateLabel(t: MapTopic): string {
  if (!isStarted(t)) return "Not started";
  if (t.pL >= MASTERED) return "Mastered";
  if (t.pL >= SOLID) return "Strong";
  if (t.pL >= WEAK) return "Learning";
  return "Needs work";
}

/**
 * The class as a map. Every topic is open; the map recommends where to go next and says why. Nodes show how far you are
 * (a ring around each), the path fills in behind you, and tapping a node opens a short card with a button into the topic.
 */
export function LearningMap({ classId, items }: { classId: string; items: MapItem[] }) {
  const sorted = useMemo(() => [...items].sort((a, b) => a.order - b.order), [items]);
  const rec = useMemo(() => recommendNext(sorted), [sorted]);
  const progress = classProgress(sorted);
  const [openId, setOpenId] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openId) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpenId(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenId(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openId]);

  if (sorted.length === 0) return null;
  const recTopic = sorted.find((t) => t.id === rec.id) ?? null;
  const points = sorted.map((_, i) => ({ x: xAt(i), y: TOP + i * ROW }));
  const height = TOP + (sorted.length - 1) * ROW + 120;

  const curve = (from: number, to: number) => {
    let d = `M ${points[from].x} ${points[from].y}`;
    for (let i = from; i < to; i++) {
      const a = points[i];
      const b = points[i + 1];
      const m = (a.y + b.y) / 2;
      d += ` C ${a.x} ${m}, ${b.x} ${m}, ${b.x} ${b.y}`;
    }
    return d;
  };
  const reached = sorted.reduce((r, t, i) => (isStarted(t) ? i : r), -1);
  const open = sorted.find((t) => t.id === openId) ?? null;
  const openIdx = open ? sorted.indexOf(open) : -1;

  return (
    <div className="space-y-6">
      {/* the one thing to do next */}
      <section aria-label="Recommended next" className="rounded-lg border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-brand-700 dark:text-brand-300">
              {rec.kind === "done" ? "All done" : rec.kind === "strengthen" ? "Recommended: strengthen" : rec.kind === "start" ? "Start here" : "Recommended next"}
            </p>
            <h3 className="text-lg font-semibold leading-snug tracking-tight">{recTopic ? recTopic.title : "You have mastered every topic"}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{rec.reason}</p>
          </div>
          {recTopic && (
            <Link href={`/classes/${classId}/topics/${recTopic.id}`} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-md bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 dark:bg-brand-500">
              Open topic <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.mastered} aria-label="Topics mastered">
            <div className="h-full rounded-full bg-brand-600 dark:bg-brand-400" style={{ width: `${(progress.mastered / progress.total) * 100}%` }} />
          </div>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {progress.mastered} of {progress.total} mastered
          </span>
        </div>
      </section>

      {/* the map */}
      <div ref={box} className="relative mx-auto w-full max-w-[560px]" style={{ height }}>
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={curve(0, sorted.length - 1)} fill="none" strokeWidth={3} strokeDasharray="2 7" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="stroke-slate-300 dark:stroke-slate-700" />
          {reached > 0 && <path d={curve(0, reached)} fill="none" strokeWidth={4} strokeLinecap="round" vectorEffect="non-scaling-stroke" className="stroke-brand-500 dark:stroke-brand-400" />}
        </svg>

        {sorted.map((t, i) => {
          const isRec = t.id === rec.id;
          const started = isStarted(t);
          const size = isRec ? NODE + 8 : NODE;
          return (
            <div key={t.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${points[i].x}%`, top: points[i].y }}>
              {isRec && (
                <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-brand-600 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white dark:bg-brand-500">
                  {rec.kind === "start" ? "Start here" : rec.kind === "strengthen" ? "Strengthen" : "Up next"}
                </span>
              )}
              <button
                type="button"
                onClick={() => setOpenId(openId === t.id ? null : t.id)}
                aria-expanded={openId === t.id}
                aria-label={`Topic ${i + 1}: ${t.title}. ${stateLabel(t)}${started ? `, ${percent(t.pL)}` : ""}${isRec ? ". Recommended" : ""}`}
                className="relative block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                style={{ width: size, height: size }}
              >
                {isRec && <span className="node-pulse absolute inset-0 rounded-full border-2 border-brand-500 dark:border-brand-400" aria-hidden="true" />}
                <svg className="absolute inset-0" viewBox="0 0 64 64" aria-hidden="true">
                  <circle cx="32" cy="32" r="29" fill="none" strokeWidth="4" className="stroke-slate-200 dark:stroke-slate-700" />
                  {started && (
                    <circle cx="32" cy="32" r="29" fill="none" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 29 * Math.min(1, t.pL)} 999`} transform="rotate(-90 32 32)" className="stroke-brand-600 dark:stroke-brand-300" />
                  )}
                </svg>
                <span className={cn("absolute inset-[7px] flex items-center justify-center rounded-full border text-base font-semibold", look(t))}>
                  {isMastered(t) ? <Check className="h-6 w-6" aria-hidden="true" /> : i + 1}
                </span>
              </button>
              <p className={cn("relative mx-auto mt-2 line-clamp-2 w-[132px] rounded bg-background/90 px-1 py-0.5 text-center text-xs leading-snug", isRec ? "font-semibold" : "text-muted-foreground")}>{t.title}</p>
            </div>
          );
        })}

        {open && (
          <div role="dialog" aria-label={open.title} className="absolute inset-x-1 z-20 rounded-lg border border-border bg-card p-4 shadow-lg" style={{ top: Math.min(points[openIdx].y + 62, height - 20) }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Topic {openIdx + 1} · {stateLabel(open)}{isStarted(open) ? ` · ${percent(open.pL)}` : ""}</p>
                <h4 className="mt-0.5 text-base font-semibold leading-snug">{open.title}</h4>
              </div>
              {open.labType && open.labType !== "none" && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  <FlaskConical className="h-3 w-3" aria-hidden="true" /> Lab
                </span>
              )}
            </div>
            {open.description && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{open.description}</p>}
            {open.objectives && open.objectives.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {open.objectives.slice(0, 3).map((o) => (
                  <li key={o} className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    <Flag className="h-3 w-3 shrink-0" aria-hidden="true" /> <span className="line-clamp-1">{o}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex items-center justify-between gap-3">
              {open.id === rec.id ? <p className="text-xs text-brand-700 dark:text-brand-300">{rec.reason}</p> : <span />}
              <Link href={`/classes/${classId}/topics/${open.id}`} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-brand-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700 dark:bg-brand-500">
                Open <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </div>

      <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground" aria-label="Map key">
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border border-brand-800 bg-brand-700 dark:bg-brand-500" /> Mastered</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border border-brand-300 bg-brand-200 dark:bg-brand-400/35" /> Strong</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800" /> Learning</li>
        <li className="flex items-center gap-1.5"><span className="cell-hatch h-3 w-3 rounded-full border border-orange-400 bg-orange-100 dark:bg-orange-500/20" /> Needs work</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border border-dashed border-slate-400" /> Not started</li>
      </ul>
    </div>
  );
}
