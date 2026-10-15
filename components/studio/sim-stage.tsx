"use client";

import React, { useEffect, useState } from "react";
import { Columns2, Maximize2, Minimize2, Play, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StageView {
  key: string;
  label: string;
  node: React.ReactNode;
}

export interface StageLab {
  id: string;
  title: string;
  kind: string;
}

/**
 * Fullscreen simulation stage. Everything for one design in one place — 3D world, circuit bench,
 * code/blocks and controls — with a single Run button, quick switching between views (or 3D + one
 * other side by side) and between your labs. It covers the whole screen, asks the browser for real
 * fullscreen + landscape where that's supported (Android), and works the same where it isn't (iPhone).
 */
export function SimStage({
  title,
  views,
  view,
  onView,
  split,
  onSplit,
  running,
  canRun,
  onRun,
  onStop,
  labs,
  labId,
  onLab,
  onClose,
}: {
  title: string;
  views: StageView[];
  view: string;
  onView: (key: string) => void;
  split: boolean;
  onSplit: (v: boolean) => void;
  running: boolean;
  canRun: boolean;
  onRun: () => void;
  onStop: () => void;
  labs: StageLab[];
  labId: string;
  onLab: (id: string) => void;
  onClose: () => void;
}) {
  const [full, setFull] = useState(false);
  const [wide, setWide] = useState(true);
  const [portrait, setPortrait] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);

  // Ask for real fullscreen + landscape on open (needs the tap that opened us; fails quietly elsewhere)
  useEffect(() => {
    const root = document.documentElement;
    root.requestFullscreen?.().catch(() => undefined);
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    orientation?.lock?.("landscape").catch(() => undefined);
    const onFs = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.body.style.overflow = prevOverflow;
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
      orientation?.unlock?.();
    };
  }, []);

  useEffect(() => {
    const measure = () => {
      setWide(window.innerWidth >= 720);
      setPortrait(window.innerHeight > window.innerWidth && window.innerWidth < 720);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const main = views.find((v) => v.key === view) || views[0];
  const firstOther = views.find((v) => v.key !== "3d");
  const showSplit = split && wide && views.some((v) => v.key === "3d") && views.length > 1;
  const left = showSplit ? views.find((v) => v.key === "3d")! : main;
  const right = showSplit ? (main.key === "3d" ? firstOther : main) : null;

  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    else document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-slate-950 text-slate-100" role="dialog" aria-label="Simulation stage">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-white/10 px-2 py-1.5 [padding-left:max(0.5rem,env(safe-area-inset-left))] [padding-right:max(0.5rem,env(safe-area-inset-right))]">
        <button type="button" onClick={onClose} aria-label="Exit full screen" className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20">
          <X className="h-4 w-4" />
        </button>
        {running ? (
          <button type="button" onClick={onStop} className="flex h-9 items-center gap-1 rounded-lg bg-rose-600 px-3 text-sm font-bold hover:bg-rose-500">
            <Square className="h-4 w-4" /> Stop
          </button>
        ) : (
          <button type="button" onClick={onRun} disabled={!canRun} className="flex h-9 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-sm font-bold hover:bg-emerald-500 disabled:opacity-40">
            <Play className="h-4 w-4" /> Run
          </button>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {views.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => onView(v.key)}
              className={cn("h-9 shrink-0 rounded-lg px-3 text-xs font-bold", v.key === view ? "bg-teal-600 text-white" : "bg-white/10 text-slate-300 hover:bg-white/20")}
            >
              {v.label}
            </button>
          ))}
        </div>
        {wide && views.length > 1 && (
          <button type="button" onClick={() => onSplit(!split)} aria-label="Split view" title="3D + another view side by side" className={cn("flex h-9 w-9 items-center justify-center rounded-lg", split ? "bg-teal-600" : "bg-white/10 hover:bg-white/20")}>
            <Columns2 className="h-4 w-4" />
          </button>
        )}
        <select
          value={labId}
          onChange={(e) => onLab(e.target.value)}
          aria-label="Switch lab"
          className="h-9 max-w-[9rem] rounded-lg border border-white/10 bg-slate-900 px-2 text-xs text-slate-100 sm:max-w-[14rem]"
          title={title}
        >
          {!labs.some((l) => l.id === labId) && <option value={labId}>{title}</option>}
          {labs.map((l) => (
            <option key={l.id} value={l.id}>{l.title}</option>
          ))}
        </select>
        <button type="button" onClick={toggleFull} aria-label={full ? "Leave browser full screen" : "Browser full screen"} className="hidden h-9 w-9 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 sm:flex">
          {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      {portrait && !hintDismissed && (
        <div className="flex items-center gap-2 bg-amber-500/15 px-3 py-1.5 text-xs text-amber-200">
          <span className="inline-block origin-center rotate-90">📱</span> Turn your phone sideways for more room.
          <button type="button" onClick={() => setHintDismissed(true)} className="ml-auto text-amber-300 underline">Dismiss</button>
        </div>
      )}

      <div className={cn("grid min-h-0 flex-1 gap-1.5 p-1.5 [padding-left:max(0.375rem,env(safe-area-inset-left))] [padding-right:max(0.375rem,env(safe-area-inset-right))]", showSplit ? "grid-cols-2" : "grid-cols-1")}>
        <div className="min-h-0 min-w-0 overflow-auto rounded-xl border border-white/10 bg-[#F7F6F2] text-slate-900 dark:bg-[#0B0F14] dark:text-slate-100" key={left.key}>{left.node}</div>
        {right && <div className="min-h-0 min-w-0 overflow-auto rounded-xl border border-white/10 bg-[#F7F6F2] text-slate-900 dark:bg-[#0B0F14] dark:text-slate-100" key={right.key}>{right.node}</div>}
      </div>
    </div>
  );
}
