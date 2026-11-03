"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { createSpeaker, type Speaker } from "@/lib/audio/speak";
import type { LessonScript } from "@/lib/teach/script";
import { BlockView } from "./blocks";
import { cn } from "@/lib/utils";

const SPEEDS = [0.75, 1, 1.5];

/**
 * Plays a lesson scene by scene: an animated, interactive block, the teacher's narration (spoken, and always shown as text),
 * with play/pause, step back/forward and a speed control. Works without sound, and a failed voice never stops the lesson.
 */
export function TeachPlayer({ script }: { script: LessonScript }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [voice, setVoice] = useState(true);
  const [speed, setSpeed] = useState(1);
  const speaker = useRef<Speaker | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const total = script.scenes.length;
  const scene = script.scenes[Math.min(i, total - 1)];

  const halt = useCallback(() => {
    speaker.current?.stop();
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => halt, [halt]);

  // while playing: speak the scene (or wait a reading time), then move on
  useEffect(() => {
    if (!playing) return;
    const next = () => {
      if (i >= total - 1) setPlaying(false);
      else setI(i + 1);
    };
    const readingMs = Math.max(3500, (scene.narration.length * 60) / speed);
    if (voice) {
      speaker.current ||= createSpeaker();
      speaker.current.say(scene.narration, () => (timer.current = setTimeout(next, 900 / speed)), () => (timer.current = setTimeout(next, readingMs)));
    } else {
      timer.current = setTimeout(next, readingMs);
    }
    return halt;
  }, [playing, i, voice, speed, total, scene.narration, halt]);

  const go = (n: number) => {
    halt();
    setI(Math.max(0, Math.min(total - 1, n)));
  };
  const revealMs = 1100 / speed;

  return (
    <Card className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <p className="font-bold flex-1 min-w-0 truncate">{script.title}</p>
        <span className="text-xs text-slate-500">Scene {i + 1} of {total}</span>
      </div>

      <div key={i} className="min-h-[260px] animate-in fade-in duration-300">
        <BlockView block={scene.block} ms={revealMs} />
      </div>

      <p className="rounded-xl bg-slate-100 dark:bg-slate-900 px-3 py-2 text-sm leading-relaxed">{scene.narration}</p>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous scene" className="h-9 w-9 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center justify-center disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
        <button
          type="button"
          onClick={() => {
            if (playing) {
              halt();
              setPlaying(false);
            } else {
              if (i >= total - 1) setI(0);
              setPlaying(true);
            }
          }}
          className="h-9 rounded-xl bg-teal-600 px-4 text-sm font-bold text-white flex items-center gap-1.5"
        >
          {playing ? <><Pause className="h-4 w-4" /> Pause</> : <><Play className="h-4 w-4" /> {i >= total - 1 ? "Replay" : "Play lesson"}</>}
        </button>
        <button type="button" onClick={() => go(i + 1)} disabled={i >= total - 1} aria-label="Next scene" className="h-9 w-9 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center justify-center disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
        <div className="flex-1" />
        <button type="button" onClick={() => { halt(); setVoice((v) => !v); }} aria-pressed={voice} aria-label={voice ? "Turn the voice off" : "Turn the voice on"} className="h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 text-xs font-semibold flex items-center gap-1.5">
          {voice ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} {voice ? "Voice on" : "Voice off"}
        </button>
        <div className="flex rounded-xl border border-slate-300 dark:border-slate-700 overflow-hidden" role="group" aria-label="Speed">
          {SPEEDS.map((s) => (
            <button key={s} type="button" onClick={() => setSpeed(s)} aria-pressed={speed === s} className={cn("px-2.5 h-9 text-xs font-semibold", speed === s ? "bg-teal-600 text-white" : "hover:bg-slate-100 dark:hover:bg-slate-900")}>{s}×</button>
          ))}
        </div>
      </div>

      <div className="flex justify-center gap-1.5" role="tablist" aria-label="Scenes">
        {script.scenes.map((s, k) => (
          <button key={k} type="button" onClick={() => go(k)} aria-label={`Scene ${k + 1}: ${s.caption || s.block.type}`} aria-selected={k === i} className={cn("h-2 rounded-full transition-all", k === i ? "w-6 bg-teal-600" : "w-2 bg-slate-300 dark:bg-slate-700")} />
        ))}
      </div>
    </Card>
  );
}
