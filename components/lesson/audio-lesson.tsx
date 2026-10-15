"use client";

import React, { useEffect, useRef, useState } from "react";
import { Headphones, Play, Pause, SkipBack, SkipForward, Loader2, RotateCw, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface Turn {
  speaker: "teacher" | "student";
  text: string;
  hasAudio: boolean;
}

interface Lesson {
  status: "ready" | "generating" | "failed";
  title: string;
  turns: Turn[];
  teacherName: string;
  studentName: string;
  voiceStyle: "female" | "male";
  version: number;
  error?: string | null;
}

interface Payload {
  lesson: Lesson | null;
  enabled: boolean;
  canManage: boolean;
  canGenerate: boolean;
}

const SPEEDS = [1, 1.25, 1.5, 0.85];

/**
 * Plays a lesson turn by turn: recorded MP3 when available, browser speech otherwise.
 * Kept outside React so the play-next chain isn't fighting render cycles.
 */
class Narrator {
  private audio: HTMLAudioElement | null = null;
  private active = false;
  speed = 1;
  constructor(
    private urlFor: (i: number) => string,
    private onIndex: (i: number) => void,
    private onStop: () => void
  ) {}

  play(turns: Turn[], from: number) {
    this.active = true;
    this.playTurn(turns, from);
  }

  stop() {
    this.active = false;
    this.audio?.pause();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }

  setSpeed(s: number) {
    this.speed = s;
    if (this.audio) this.audio.playbackRate = s;
  }

  private playTurn(turns: Turn[], i: number) {
    this.audio?.pause();
    window.speechSynthesis?.cancel();
    if (!this.active) return;
    if (i >= turns.length) {
      this.active = false;
      this.onIndex(0);
      this.onStop();
      return;
    }
    this.onIndex(i);
    const turn = turns[i];
    const next = () => {
      if (this.active) this.playTurn(turns, i + 1);
    };
    if (turn.hasAudio) {
      if (!this.audio) this.audio = new Audio();
      const a = this.audio;
      let settled = false;
      const fallback = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        a.pause();
        this.speak(turn, next);
      };
      // A clip is recorded on first play; if it doesn't start quickly, use the device voice instead
      const timer = setTimeout(fallback, 10000);
      a.src = this.urlFor(i);
      a.playbackRate = this.speed;
      a.onplaying = () => {
        settled = true;
        clearTimeout(timer);
      };
      a.onended = next;
      a.onerror = fallback;
      a.play().catch(fallback);
      // Warm the next clip so it's ready (and recorded) by the time this one ends
      if (i + 1 < turns.length && turns[i + 1].hasAudio) fetch(this.urlFor(i + 1)).catch(() => null);
    } else {
      this.speak(turn, next);
    }
  }

  private speak(turn: Turn, onEnd: () => void) {
    const synth = window.speechSynthesis;
    if (!synth) return onEnd();
    const u = new SpeechSynthesisUtterance(turn.text);
    u.rate = this.speed;
    const voices = synth.getVoices().filter((v) => v.lang.startsWith("en"));
    if (voices.length > 1) u.voice = turn.speaker === "teacher" ? voices[0] : voices[1];
    u.onend = onEnd;
    synth.speak(u);
  }
}

async function fetchAudio(base: string): Promise<Payload | null> {
  try {
    const res = await fetch(base);
    const data = await res.json();
    return data.ok ? data.data : null;
  } catch {
    return null;
  }
}

/** Two-voice narrated lesson, recorded once per topic and replayed by every learner. */
export function AudioLesson({ classId, kcId }: { classId: string; kcId: string }) {
  const { toast } = useToast();
  const base = `/api/classes/${classId}/kcs/${kcId}/audio`;
  const [payload, setPayload] = useState<Payload | null>(null);
  const [generating, setGenerating] = useState(false);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const narratorRef = useRef<Narrator | null>(null);
  const transcriptRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    fetchAudio(base).then(setPayload);
  }, [base]);

  const lesson = payload?.lesson && payload.lesson.status === "ready" ? payload.lesson : null;
  const version = lesson?.version || 0;

  useEffect(() => {
    const n = new Narrator(
      (i) => `${base}/${i}?v=${version}`,
      (i) => setIndex(i),
      () => setPlaying(false)
    );
    narratorRef.current = n;
    return () => n.stop();
  }, [base, version]);

  const stopAll = () => narratorRef.current?.stop();

  // Keep the active line visible in the transcript
  useEffect(() => {
    const el = transcriptRef.current?.querySelector(`[data-turn="${index}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [index]);

  const toggle = () => {
    if (!lesson) return;
    if (playing) {
      setPlaying(false);
      stopAll();
    } else {
      setPlaying(true);
      setExpanded(true);
      narratorRef.current?.play(lesson.turns, index);
    }
  };

  const jump = (i: number) => {
    if (!lesson) return;
    const clamped = Math.max(0, Math.min(lesson.turns.length - 1, i));
    setPlaying(true);
    narratorRef.current?.play(lesson.turns, clamped);
  };

  const generate = async (regenerate = false) => {
    setGenerating(true);
    stopAll();
    setPlaying(false);
    try {
      for (let attempt = 0; attempt < 30; attempt++) {
        const res = await fetch(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ regenerate }),
        });
        const data = await res.json().catch(() => null);
        if (data?.ok) {
          setPayload((p) => (p ? { ...p, lesson: data.data.lesson } : p));
          setIndex(0);
          toast({ title: "Audio lesson ready 🎧", variant: "success" });
          return;
        }
        if (data?.error?.code === "AUDIO_GENERATING" || data?.error?.code === "AUDIO_EXISTS" || !data) {
          await new Promise((r) => setTimeout(r, 6000));
          const fresh = await fetchAudio(base);
          if (fresh?.lesson?.status === "ready") {
            setPayload(fresh);
            return;
          }
          continue;
        }
        toast({ title: "Couldn't record the audio lesson", description: data.error?.message, variant: "destructive" });
        return;
      }
    } finally {
      setGenerating(false);
    }
  };

  if (!payload) return null;
  if (!lesson && !payload.canGenerate && !(payload.lesson?.status === "generating")) return null;

  const minutes = lesson ? Math.max(1, Math.round(lesson.turns.reduce((n, t) => n + t.text.split(/\s+/).length, 0) / 150)) : 0;

  return (
    <Card className="overflow-hidden border-indigo-500/30">
      <div className="p-4 sm:p-5 bg-gradient-to-r from-indigo-500/10 via-teal-500/10 to-transparent">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 shrink-0 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
            <Headphones className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold leading-tight">{lesson ? lesson.title : "Listen to this lesson"}</p>
            <p className="text-xs text-slate-500">
              {lesson
                ? `${lesson.teacherName} & ${lesson.studentName} · ~${minutes} min`
                : generating || payload.lesson?.status === "generating"
                ? "Writing the lesson script… about 10 seconds"
                : "A short spoken conversation between a teacher and a student"}
            </p>
          </div>
          {lesson ? (
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? "Pause" : "Play"}
              className="h-12 w-12 shrink-0 rounded-full bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center shadow-lg"
            >
              {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
            </button>
          ) : (
            <Button size="sm" onClick={() => generate(false)} isLoading={generating || payload.lesson?.status === "generating"}>
              <Sparkles className="h-4 w-4 mr-1" /> Create
            </Button>
          )}
        </div>

        {lesson && (
          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={() => jump(index - 1)} className="p-2 rounded-lg hover:bg-white/60 dark:hover:bg-slate-900" aria-label="Previous">
              <SkipBack className="h-4 w-4" />
            </button>
            <div className="flex-1 flex gap-0.5">
              {lesson.turns.map((t, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => jump(i)}
                  aria-label={`Go to part ${i + 1}`}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-colors",
                    i < index ? "bg-teal-500" : i === index ? (playing ? "bg-teal-400 animate-pulse" : "bg-teal-400") : "bg-slate-300 dark:bg-slate-700"
                  )}
                />
              ))}
            </div>
            <button type="button" onClick={() => jump(index + 1)} className="p-2 rounded-lg hover:bg-white/60 dark:hover:bg-slate-900" aria-label="Next">
              <SkipForward className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
                setSpeed(next);
                narratorRef.current?.setSpeed(next);
              }}
              className="text-xs font-bold px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 tabular-nums"
              aria-label="Playback speed"
            >
              {speed}×
            </button>
          </div>
        )}
      </div>

      {lesson && (expanded || playing) && (
        <ol ref={transcriptRef} className="max-h-64 overflow-y-auto p-4 space-y-2">
          {lesson.turns.map((t, i) => (
            <li
              key={i}
              data-turn={i}
              onClick={() => jump(i)}
              className={cn(
                "flex gap-2 rounded-xl p-2 cursor-pointer transition-colors",
                i === index ? "bg-teal-500/10" : "hover:bg-slate-50 dark:hover:bg-slate-900"
              )}
            >
              <span
                className={cn(
                  "shrink-0 h-7 w-7 rounded-full text-[11px] font-bold flex items-center justify-center text-white",
                  t.speaker === "teacher" ? "bg-indigo-600" : "bg-amber-500"
                )}
              >
                {(t.speaker === "teacher" ? lesson.teacherName : lesson.studentName).replace(/^(Ms\.|Mr\.)\s*/, "").charAt(0)}
              </span>
              <p className={cn("text-sm leading-relaxed", i === index ? "text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-400")}>
                <span className="font-semibold">{t.speaker === "teacher" ? lesson.teacherName : lesson.studentName}: </span>
                {t.text}
              </p>
            </li>
          ))}
        </ol>
      )}

      {lesson && !expanded && !playing && (
        <button type="button" onClick={() => setExpanded(true)} className="w-full text-xs font-semibold py-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
          Show transcript
        </button>
      )}

      {payload.canManage && lesson && (
        <div className="px-4 pb-3 flex justify-end">
          <button type="button" onClick={() => generate(true)} disabled={generating} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />} Re-record
          </button>
        </div>
      )}
    </Card>
  );
}
