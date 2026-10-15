"use client";

import React, { useEffect, useRef, useState } from "react";
import { Headphones, Play, Pause, SkipBack, SkipForward, Loader2, RotateCw, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { ClipQueue, type ClipStatus } from "@/lib/audio/clip-queue";

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

/** 44-byte silent WAV, played inside the Play tap so later (async) clip playback isn't blocked on iOS */
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

/**
 * Plays a lesson turn by turn. Clips come from a ClipQueue that keeps voicing the following lines
 * in the background, so the next line is usually ready before the current one ends. A line that
 * can't be voiced is read by the device voice. Kept outside React so the play-next chain isn't
 * fighting render cycles.
 */
class Narrator {
  private audio: HTMLAudioElement | null = null;
  private active = false;
  private token = 0;
  speed = 1;
  constructor(
    private queue: ClipQueue,
    private onIndex: (i: number) => void,
    private onStop: () => void,
    private onBuffering: (b: boolean) => void
  ) {}

  play(turns: Turn[], from: number) {
    this.active = true;
    if (!this.audio) this.audio = new Audio();
    // Unlock audio playback while we're still inside the user's tap
    this.audio.src = SILENT_WAV;
    this.audio.play().catch(() => null);
    void this.playTurn(turns, from);
  }

  stop() {
    this.active = false;
    this.token++;
    this.audio?.pause();
    this.onBuffering(false);
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }

  setSpeed(s: number) {
    this.speed = s;
    if (this.audio) this.audio.playbackRate = s;
  }

  private async playTurn(turns: Turn[], i: number) {
    const my = ++this.token;
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
    // Voice this line and everything after it, one by one, in the background
    this.queue.startFrom(i);
    const turn = turns[i];
    let done = false;
    const next = () => {
      if (done) return;
      done = true;
      if (this.active && this.token === my) void this.playTurn(turns, i + 1);
    };

    let url: string | null = null;
    if (turn.hasAudio) {
      if (this.queue.status(i) !== "ready") this.onBuffering(true);
      url = await this.queue.get(i);
      if (this.token === my) this.onBuffering(false);
    }
    if (!this.active || this.token !== my) return;

    if (url && this.audio) {
      const a = this.audio;
      const fallback = () => {
        if (done || this.token !== my) return;
        a.pause();
        this.speak(turn, next);
      };
      a.src = url;
      a.playbackRate = this.speed;
      a.onended = next;
      a.onerror = fallback;
      a.play().catch(fallback);
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
    u.onerror = onEnd;
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

  const [buffering, setBuffering] = useState(false);
  const [clipStatus, setClipStatus] = useState<ClipStatus[]>([]);
  const turnsKey = lesson ? lesson.turns.map((t) => (t.hasAudio ? 1 : 0)).join("") : "";

  useEffect(() => {
    if (!turnsKey) return;
    const queue = new ClipQueue(turnsKey.length, async (i) => {
      if (turnsKey[i] !== "1") return null;
      const res = await fetch(`${base}/${i}?v=${version}`);
      return res.ok ? await res.blob() : null;
    });
    // Warm the first line so Play starts right away
    queue.startFrom(0, 1);
    const unsubscribe = queue.subscribe(() => setClipStatus(Array.from({ length: queue.size }, (_, i) => queue.status(i))));
    const n = new Narrator(
      queue,
      (i) => setIndex(i),
      () => setPlaying(false),
      (b) => setBuffering(b)
    );
    narratorRef.current = n;
    return () => {
      n.stop();
      unsubscribe();
      queue.dispose();
    };
  }, [base, version, turnsKey]);

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

  const settled = clipStatus.filter((c) => c === "ready" || c === "failed").length;
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
                ? playing && buffering
                  ? "Voicing this line…"
                  : playing && settled < lesson.turns.length
                  ? `${lesson.teacherName} & ${lesson.studentName} · next lines loading in the background (${settled}/${lesson.turns.length})`
                  : `${lesson.teacherName} & ${lesson.studentName} · ~${minutes} min`
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
              {playing && buffering ? <Loader2 className="h-5 w-5 animate-spin" /> : playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
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
                    i < index
                      ? "bg-teal-500"
                      : i === index
                      ? playing
                        ? "bg-teal-400 animate-pulse"
                        : "bg-teal-400"
                      : clipStatus[i] === "ready"
                      ? "bg-teal-200 dark:bg-teal-900"
                      : clipStatus[i] === "loading"
                      ? "bg-slate-300 dark:bg-slate-700 animate-pulse"
                      : "bg-slate-300 dark:bg-slate-700"
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
