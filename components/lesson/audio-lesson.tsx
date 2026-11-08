"use client";

import React, { useEffect, useRef, useState } from "react";
import { Headphones, Play, Pause, SkipBack, SkipForward, Loader2, RotateCw, Sparkles, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { readPrefs, usePrefs } from "@/components/settings/use-prefs";
import { languageInfo } from "@/lib/i18n/languages";
import { ClipPlayer, type ClipState } from "@/lib/audio/clip-player";

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
export function AudioLesson({ classId, kcId, viewLang }: { classId: string; kcId: string; viewLang?: string | null }) {
  const { toast } = useToast();
  const [prefs] = usePrefs();
  const base = `/api/classes/${classId}/kcs/${kcId}/audio`;
  // Respect an explicit viewLang (including null when a teacher chooses "Show original"), else follow the learner's preference
  const activeLang = viewLang !== undefined ? (viewLang || "en") : prefs.language;
  const view = activeLang !== "en" ? `?lang=${activeLang}` : "";
  const [payload, setPayload] = useState<Payload | null>(null);
  const [generating, setGenerating] = useState(false);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [langRev, setLangRev] = useState(0);
  const playerRef = useRef<ClipPlayer | null>(null);
  const transcriptRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    fetchAudio(base + view).then(setPayload);
  }, [base, view]);

  const lesson = payload?.lesson && payload.lesson.status === "ready" ? payload.lesson : null;
  const version = lesson?.version || 0;

  const [buffering, setBuffering] = useState(false);
  const [clipStatus, setClipStatus] = useState<ClipState[]>([]);
  const turnsKey = lesson ? lesson.turns.map((t) => (t.hasAudio ? 1 : 0)).join("") : "";
  const turnsRef = useRef<Turn[]>([]);
  const styleRef = useRef<"female" | "male">("female");
  useEffect(() => {
    turnsRef.current = lesson?.turns || [];
    styleRef.current = lesson?.voiceStyle || "female";
  });

  useEffect(() => {
    if (!turnsKey) return;
    let stopped = false;
    const player = new ClipPlayer({
      count: turnsKey.length,
      fetchClip: async (i) => {
        if (turnsKey[i] !== "1") return null;
        try {
          // the language is part of the address: each language has its own saved recording
          const url = `${base}/${i}?v=${version}&l=${activeLang}${activeLang !== "en" ? `&lang=${activeLang}` : ""}&r=4${langRev ? `_${langRev}` : ""}`;
          // a line in another language may still be recording: 202 means "ask again shortly". The player plays the
          // lines that are ready and waits on this one, so there is never an English stand-in while it records.
          let res = await fetch(url);
          // A line that failed for now (503) is retried by the server automatically a couple of minutes later, so the
          // player keeps waiting on it (and plays every line that is ready) instead of giving up.
          for (let tries = 0; (res.status === 202 || res.status === 503) && tries < 240 && !stopped; tries++) {
            await new Promise((r) => setTimeout(r, res.status === 503 ? 20_000 : Math.min(8000, 2500 + tries * 500)));
            res = await fetch(url, { cache: "no-store" });
          }
          return res.status === 200 || res.status === 206 ? await res.arrayBuffer() : null;
        } catch {
          return null;
        }
      },
      onIndex: (i) => setIndex(i),
      onBuffering: setBuffering,
      onEnd: () => {
        setPlaying(false);
        setIndex(0);
      },
      onStatus: () => setClipStatus(Array.from({ length: turnsKey.length }, (_, i) => player.statusOf(i))),
    });
    // Start fetching every line in the background right away, so Play starts instantly
    if (!readPrefs().dataSaver) player.preload(0); // data saver: fetch audio only when Play is pressed
    playerRef.current = player;
    return () => {
      stopped = true;
      player.dispose();
      playerRef.current = null;
    };
  }, [base, version, turnsKey, activeLang, langRev]);

  const stopAll = () => playerRef.current?.stop();

  // Keep the active line visible in the transcript
  useEffect(() => {
    const el = transcriptRef.current?.querySelector(`[data-turn="${index}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [index]);

  const toggle = () => {
    if (!lesson) return;
    if (playing) {
      setPlaying(false);
      playerRef.current?.pause();
    } else {
      setPlaying(true);
      setExpanded(true);
      const p = playerRef.current;
      if (p?.isPaused) p.resume();
      else p?.play(index);
    }
  };

  const jump = (i: number) => {
    if (!lesson) return;
    const clamped = Math.max(0, Math.min(lesson.turns.length - 1, i));
    setPlaying(true);
    playerRef.current?.jump(clamped);
  };

  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [recordingNote, setRecordingNote] = useState("");

  /**
   * A long podcast is voiced part by part. One request records what fits in its time, so keep asking for the rest until
   * every line has its voice (or it stops making progress), instead of leaving the teacher to press a button again.
   */
  const keepRecording = async (start: Lesson) => {
    let current = start;
    let stuck = 0;
    for (let round = 0; round < 8; round++) {
      const left = current.turns.filter((t) => !t.hasAudio).length;
      if (!left) break;
      setRecordingNote(`Voicing the last ${left} line${left > 1 ? "s" : ""}…`);
      try {
        const res = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordMissing: true }) });
        const data = await res.json().catch(() => null);
        if (!data?.ok) break;
        const next = data.data.lesson as Lesson;
        const nowLeft = next.turns.filter((t) => !t.hasAudio).length;
        stuck = nowLeft >= left ? stuck + 1 : 0;
        current = next;
        setPayload((p) => (p ? { ...p, lesson: next } : p));
        if (stuck >= 2) break;
      } catch {
        break;
      }
    }
    setRecordingNote("");
  };

  /** Removes one line, or rewrites it and re-voices just that line. */
  const editLine = async (body: { removeTurn?: number; updateTurn?: { index: number; text: string } }) => {
    setGenerating(true);
    stopAll();
    setPlaying(false);
    try {
      const res = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        setPayload((p) => (p ? { ...p, lesson: data.data.lesson } : p));
        setEditing(null);
        toast({ title: body.removeTurn !== undefined ? "Line removed" : "Line updated and re-voiced", description: "Push when you're happy with it so students get the change.", variant: "success" });
        await keepRecording(data.data.lesson as Lesson);
      } else toast({ title: "Couldn't change the podcast", description: data?.error?.message || "Try again in a moment.", variant: "destructive" });
    } catch {
      toast({ title: "Couldn't change the podcast", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const [focus, setFocus] = useState("");
  const [showFocus, setShowFocus] = useState(false);

  /** Adds new lines to the end of the existing podcast, about what the teacher typed. */
  const extend = async () => {
    if (!focus.trim()) return;
    setGenerating(true);
    stopAll();
    setPlaying(false);
    try {
      const res = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ extend: true, instructions: focus.trim() }) });
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        setPayload((p) => (p ? { ...p, lesson: data.data.lesson } : p));
        setFocus("");
        toast({ title: "Added to the podcast 🎧", description: "Press play to hear the new part. Push it when you're happy with it.", variant: "success" });
        await keepRecording(data.data.lesson as Lesson);
      } else toast({ title: "Couldn't add to the podcast", description: data?.error?.message || "Try again in a moment.", variant: "destructive" });
    } catch {
      toast({ title: "Couldn't add to the podcast", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const generate = async (regenerate = false, instructions = "") => {
    setGenerating(true);
    stopAll();
    setPlaying(false);
    try {
      for (let attempt = 0; attempt < 30; attempt++) {
        const res = await fetch(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ regenerate, ...(instructions.trim() ? { instructions: instructions.trim() } : {}) }),
        });
        const data = await res.json().catch(() => null);
        if (data?.ok) {
          setPayload((p) => (p ? { ...p, lesson: data.data.lesson } : p));
          setIndex(0);
          toast({ title: "Audio lesson ready 🎧", variant: "success" });
          await keepRecording(data.data.lesson as Lesson);
          return;
        }
        if (data?.error?.code === "AUDIO_GENERATING" || data?.error?.code === "AUDIO_EXISTS" || !data) {
          await new Promise((r) => setTimeout(r, 6000));
          const fresh = await fetchAudio(base + view);
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

  const missing = lesson ? lesson.turns.filter((t) => !t.hasAudio).length : 0;
  const recordMissing = async () => {
    setGenerating(true);
    try {
      const res = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordMissing: true }) });
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        setPayload((p) => (p ? { ...p, lesson: data.data.lesson } : p));
        const left = (data.data.lesson.turns as Turn[]).filter((t) => !t.hasAudio).length;
        toast({ title: left ? `${left} line${left > 1 ? "s" : ""} still missing — try again` : "Every line is recorded 🎧", variant: left ? "amber" : "success" });
      } else toast({ title: "Couldn't record", description: data?.error?.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  /** Forces every line to be freshly translated and re-recorded in the currently selected language. */
  const rerecordLanguage = async () => {
    if (!lesson || activeLang === "en" || !payload?.canManage) return;
    const langName = languageInfo(activeLang).name;
    setGenerating(true);
    stopAll();
    setPlaying(false);
    setRecordingNote(`Re-recording in ${langName}…`);
    try {
      const indices = lesson.turns.map((_, i) => i).filter((i) => lesson.turns[i].hasAudio);
      let okCount = 0;
      for (let start = 0; start < indices.length; start += 2) {
        const batch = indices.slice(start, start + 2);
        setRecordingNote(`Re-recording in ${langName} (${Math.min(indices.length, start + batch.length)}/${indices.length})…`);
        const results = await Promise.all(
          batch.map(async (i) => {
            try {
              const res = await fetch(`${base}/${i}?v=${version}&l=${activeLang}&lang=${activeLang}&rerecord=1`, { cache: "no-store" });
              return res.ok;
            } catch {
              return false;
            }
          })
        );
        okCount += results.filter(Boolean).length;
      }
      setLangRev((r) => r + 1);
      toast({
        title: okCount === indices.length ? `Recorded in ${langName} 🎧` : `Recorded ${okCount}/${indices.length} lines in ${langName}`,
        variant: okCount > 0 ? "success" : "amber",
      });
    } finally {
      setRecordingNote("");
      setGenerating(false);
    }
  };

  if (!payload) return null;
  if (!lesson && !payload.canGenerate && !(payload.lesson?.status === "generating")) return null;

  const settled = clipStatus.filter((c) => c === "ready" || c === "failed").length;
  const failedClips = clipStatus.filter((c) => c === "failed").length;
  const minutes = lesson ? Math.max(1, Math.round(lesson.turns.reduce((n, t) => n + t.text.split(/\s+/).length, 0) / 150)) : 0;

  return (
    <Card className="overflow-hidden border-indigo-500/30">
      <div className="p-4 sm:p-5 bg-slate-500/10">
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

        {recordingNote && (
          <p className="mt-3 text-xs flex items-center gap-2 text-indigo-700 dark:text-indigo-300" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {recordingNote}
          </p>
        )}
        {lesson && activeLang !== "en" && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
            <span>
              {failedClips > 0
                ? `${failedClips} line${failedClips > 1 ? "s" : ""} in ${languageInfo(activeLang).name} couldn't load${payload.canManage ? " — tap Re-record to voice them." : "."}`
                : `Spoken in ${languageInfo(activeLang).name} (${languageInfo(activeLang).native}).`}
            </span>
            {payload.canManage ? (
              <button
                type="button"
                onClick={rerecordLanguage}
                disabled={generating}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 hover:underline"
              >
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />} Re-record {languageInfo(activeLang).name}
              </button>
            ) : (
              failedClips > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    stopAll();
                    setPlaying(false);
                    setLangRev((r) => r + 1);
                  }}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 hover:underline"
                >
                  <RotateCw className="h-3.5 w-3.5" /> Try again
                </button>
              )
            )}
          </div>
        )}
        {lesson && payload.canManage && activeLang === "en" && (
          <p className={cn("mt-3 text-xs flex flex-wrap items-center gap-2", missing ? "text-amber-700 dark:text-amber-300" : "text-slate-500")}>
            {missing ? `${lesson.turns.length - missing}/${lesson.turns.length} lines recorded. The rest stay silent until they are recorded.` : `All ${lesson.turns.length} lines are recorded and saved once — every student replays the same files.`}
            {missing > 0 && (
              <Button size="sm" variant="outline" onClick={recordMissing} isLoading={generating}>
                Record missing lines
              </Button>
            )}
          </p>
        )}
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
                playerRef.current?.setRate(next);
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
                "flex flex-wrap gap-2 rounded-xl p-2 cursor-pointer transition-colors",
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
                {editing === i ? null : t.text}
                {!t.hasAudio && <span className="ml-1 text-[10px] font-bold text-amber-600">not voiced yet</span>}
              </p>
              {payload.canManage && !viewLang && editing !== i && (
                <span className="ml-auto flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                  <button type="button" aria-label={`Edit line ${i + 1}`} disabled={generating} onClick={() => { setEditing(i); setEditText(t.text); }} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove line ${i + 1}`}
                    disabled={generating || lesson.turns.length <= 2}
                    onClick={() => { if (window.confirm("Remove this line from the podcast?")) editLine({ removeTurn: i }); }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
              {editing === i && (
                <div className="basis-full space-y-2" onClick={(e) => e.stopPropagation()}>
                  <textarea value={editText} onChange={(e) => setEditText(e.target.value)} maxLength={1600} rows={4} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-sm" aria-label={`Text of line ${i + 1}`} />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={editText.trim().length < 2 || generating} isLoading={generating} onClick={() => editLine({ updateTurn: { index: i, text: editText.trim() } })}>
                      Save &amp; re-voice this line
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {lesson && !expanded && !playing && (
        <button type="button" onClick={() => setExpanded(true)} className="w-full text-xs font-semibold py-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
          Show transcript
        </button>
      )}

      {payload.canManage && !viewLang && lesson && (
        <div className="px-4 pb-3 space-y-2">
          <button type="button" onClick={() => setShowFocus((v) => !v)} aria-expanded={showFocus} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5" /> {showFocus ? "Hide" : "Change or add to this podcast"}
          </button>
          {showFocus && (
            <div className="space-y-2 rounded-xl border border-indigo-500/30 p-3">
              <label className="text-xs font-semibold block" htmlFor="podcast-focus">
                What should it talk about?
              </label>
              <textarea
                id="podcast-focus"
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                maxLength={800}
                rows={3}
                placeholder="e.g. Explain how a capacitor stores charge, step by step, and why it matters for filters"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={extend} disabled={!focus.trim() || generating} isLoading={generating}>
                  Add to this podcast
                </Button>
                <Button size="sm" variant="outline" onClick={() => generate(true, focus)} disabled={generating}>
                  Write a new one with this focus
                </Button>
              </div>
              <p className="text-[11px] text-slate-500">&quot;Add&quot; keeps what is recorded and adds new lines at the end. &quot;New&quot; replaces the whole podcast (leave the box empty to simply re-record it).</p>
            </div>
          )}
          <div className="flex justify-end">
            <button type="button" onClick={() => generate(true)} disabled={generating} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />} Re-record
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
