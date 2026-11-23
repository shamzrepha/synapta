"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Check, Clock, Headphones, Loader2, Mic, MicOff, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { compressImage } from "@/lib/image-compress";
import { cn } from "@/lib/utils";
import {
  availableItems,
  buildSprint,
  countForMinutes,
  recommendedMinutes,
  summarizeSprint,
  topicsOf,
  type BankQuestion,
  type SprintFormat,
  type SprintItem,
} from "@/lib/practice/sprint";

const FORMATS: Array<{ id: SprintFormat; label: string; hint: string }> = [
  { id: "cbt", label: "Objective (CBT)", hint: "Pick the right option, like JAMB or a CBT exam" },
  { id: "theory", label: "Theory", hint: "Write, say or snap your answer" },
  { id: "mixed", label: "Mixed", hint: "Both kinds" },
];
const COUNTS = [5, 10, 20, 40];

type Phase = "setup" | "run" | "done";

interface SpeechRec {
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
}
const speechCtor = (): (new () => SpeechRec) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Timed practice across a class's past questions: choose the kind, the topics, how many and how long; answer by tapping, typing, speaking or a photo. */
export function ExamSprint({ classId }: { classId: string }) {
  const { toast } = useToast();
  const [bank, setBank] = useState<BankQuestion[] | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>("setup");
  const [format, setFormat] = useState<SprintFormat>("cbt");
  const [topics, setTopics] = useState<string[]>([]);
  const [count, setCount] = useState(10);
  const [timed, setTimed] = useState(true);
  const [minutes, setMinutes] = useState<number | null>(null);

  const [items, setItems] = useState<SprintItem[]>([]);
  const [pos, setPos] = useState(0);
  const [scores, setScores] = useState<Record<string, number | undefined>>({});
  const [remaining, setRemaining] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/classes/${classId}/past-questions`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j.ok) return setError(j.error?.message || "Couldn't load the past questions.");
        setTitle(String(j.data?.classTitle || ""));
        setBank(asArray<BankQuestion>(j.data?.items));
      })
      .catch(() => alive && setError("Couldn't load the past questions. Check your connection."));
    return () => {
      alive = false;
    };
  }, [classId]);

  const topicList = useMemo(() => topicsOf(bank || []), [bank]);
  const pool = useMemo(() => availableItems(bank || [], format, topics), [bank, format, topics]);
  const maxCount = pool.length;
  const effectiveCount = Math.min(count, maxCount);
  const sample = useMemo(() => buildSprint(pool, effectiveCount, () => 0.5), [pool, effectiveCount]);
  const suggested = recommendedMinutes(sample);
  const chosenMinutes = minutes ?? suggested;

  const start = () => {
    const picked = buildSprint(pool, effectiveCount);
    if (picked.length === 0) return;
    setItems(picked);
    setPos(0);
    setScores({});
    leftRef.current = timed ? chosenMinutes * 60_000 : 0;
    setRemaining(leftRef.current);
    setPaused(false);
    setPhase("run");
  };

  // The clock only runs while the student is working: it stops while an answer is being marked.
  const last = useRef(0);
  const leftRef = useRef(0);
  useEffect(() => {
    if (phase !== "run" || !timed) return;
    last.current = performance.now();
    const t = setInterval(() => {
      const now = performance.now();
      const dt = now - last.current;
      last.current = now;
      if (paused) return;
      const left = Math.max(0, leftRef.current - dt);
      leftRef.current = left;
      setRemaining(left);
      if (left <= 0) setPhase("done");
    }, 250);
    return () => clearInterval(t);
  }, [phase, timed, paused]);

  const record = useCallback((id: string, score: number) => setScores((s) => (s[id] === undefined ? { ...s, [id]: score } : s)), []);
  const next = () => (pos + 1 >= items.length ? setPhase("done") : setPos(pos + 1));

  if (error) {
    return (
      <Card className="mx-auto max-w-xl space-y-3 p-5 text-center">
        <p className="text-sm">{error}</p>
        <Link href={`/classes/${classId}`} className="text-sm font-semibold text-brand-700 dark:text-brand-300">Back to the class</Link>
      </Card>
    );
  }
  if (!bank) return <Skeleton className="mx-auto h-72 max-w-xl" />;

  if (phase === "setup") {
    const canStart = maxCount > 0;
    return (
      <div className="mx-auto max-w-xl space-y-5">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-brand-700 dark:text-brand-300">Exam sprint</p>
          <h1 className="text-2xl font-semibold tracking-tight">{title || "Past questions"}</h1>
          <p className="text-sm text-muted-foreground">Choose the kind of questions, the topics, how many, and how long. You do not need to be inside a topic.</p>
        </div>

        <section aria-label="Kind of questions" className="space-y-2">
          <h2 className="text-sm font-semibold">Kind of questions</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {FORMATS.map((f) => (
              <button key={f.id} type="button" onClick={() => setFormat(f.id)} aria-pressed={format === f.id} className={cn("min-h-[64px] rounded-lg border p-3 text-left", format === f.id ? "border-brand-600 bg-brand-600/10" : "border-border bg-card hover:bg-muted/60")}>
                <span className="block text-sm font-semibold">{f.label}</span>
                <span className="block text-xs text-muted-foreground">{f.hint}</span>
              </button>
            ))}
          </div>
        </section>

        <section aria-label="Topics" className="space-y-2">
          <div className="flex items-baseline justify-between"><h2 className="text-sm font-semibold">Topics</h2><button type="button" onClick={() => setTopics([])} className="min-h-[44px] px-2 text-xs font-semibold text-brand-700 dark:text-brand-300">All topics</button></div>
          <div className="flex flex-wrap gap-2">
            {topicList.map((t) => {
              const on = topics.includes(t.topic);
              return (
                <button key={t.topic} type="button" aria-pressed={on} onClick={() => setTopics((cur) => (on ? cur.filter((x) => x !== t.topic) : [...cur, t.topic]))} className={cn("min-h-[44px] rounded-full border px-3 text-xs font-semibold", on ? "border-brand-600 bg-brand-600 text-white" : "border-border bg-card hover:bg-muted/60")}>
                  {t.topic} <span className="opacity-70">· {t.count}</span>
                </button>
              );
            })}
            {topicList.length === 0 && <p className="text-sm text-muted-foreground">No past questions have been added to this class yet.</p>}
          </div>
        </section>

        <section aria-label="How many" className="space-y-2">
          <h2 className="text-sm font-semibold">How many questions</h2>
          <div className="flex flex-wrap gap-2">
            {COUNTS.map((c) => (
              <button key={c} type="button" onClick={() => setCount(c)} aria-pressed={count === c} className={cn("min-h-[44px] min-w-[56px] rounded-lg border px-3 text-sm font-semibold tabular-nums", count === c ? "border-brand-600 bg-brand-600 text-white" : "border-border bg-card hover:bg-muted/60")}>{c}</button>
            ))}
            <button type="button" onClick={() => { const n = countForMinutes(30, format); setCount(n); setMinutes(30); setTimed(true); }} className="min-h-[44px] rounded-lg border border-border bg-card px-3 text-sm font-semibold hover:bg-muted/60">30-minute sprint</button>
          </div>
          <p className="text-xs text-muted-foreground">{maxCount === 0 ? "Nothing matches this setup. Try another kind or more topics." : `${effectiveCount} of ${maxCount} available.`}</p>
        </section>

        <section aria-label="Time" className="space-y-2">
          <h2 className="text-sm font-semibold">Time</h2>
          <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} className="h-4 w-4" /> Timed</label>
          {timed && (
            <div className="flex items-center gap-3">
              <button type="button" aria-label="Less time" onClick={() => setMinutes(Math.max(5, chosenMinutes - 5))} className="h-11 w-11 rounded-lg border border-border text-lg">−</button>
              <p className="min-w-[8rem] text-center text-lg font-semibold tabular-nums">{chosenMinutes} min</p>
              <button type="button" aria-label="More time" onClick={() => setMinutes(chosenMinutes + 5)} className="h-11 w-11 rounded-lg border border-border text-lg">+</button>
              <p className="text-xs text-muted-foreground">Suggested: {suggested} min</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">The clock stops while an answer is being marked.</p>
        </section>

        <Button size="lg" className="w-full" disabled={!canStart} onClick={start}>Start sprint</Button>
        <Link href={`/classes/${classId}/past-questions`} className="block text-center text-xs font-semibold text-muted-foreground">Browse past questions instead</Link>
      </div>
    );
  }

  if (phase === "done") {
    const r = summarizeSprint(items, scores);
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Card className="space-y-3 p-6 text-center">
          <p className="text-4xl font-semibold tabular-nums">{r.pct}%</p>
          <p className="text-sm text-muted-foreground">{r.answered} of {r.total} answered{timed && remaining <= 0 ? ". Time is up" : ""}.</p>
        </Card>
        <section aria-label="By topic" className="space-y-2">
          <h2 className="text-sm font-semibold">By topic</h2>
          {r.topics.map((t) => (
            <div key={t.topic} className="space-y-1">
              <div className="flex justify-between text-sm"><span className="truncate pr-2">{t.topic}</span><span className="font-mono text-xs tabular-nums">{t.pct}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${t.topic}: ${t.pct} percent`}><div className="h-full rounded-full bg-brand-600" style={{ width: `${t.pct}%` }} /></div>
            </div>
          ))}
        </section>
        <div className="flex flex-wrap gap-2">
          {r.weakest.length > 0 && <Button onClick={() => { setTopics(r.weakest); setPhase("setup"); }}>Practise the weak topics</Button>}
          <Button variant="outline" onClick={() => setPhase("setup")}>New sprint</Button>
          <Link href="/study/mistakes"><Button variant="outline">My mistakes</Button></Link>
        </div>
      </div>
    );
  }

  const item = items[pos];
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span>Question {pos + 1} of {items.length}</span>
        {timed && <span className={cn("flex items-center gap-1 tabular-nums", remaining < 60_000 && "text-rose-600")}><Clock className="h-4 w-4" aria-hidden="true" /> {paused ? "Marking…" : fmt(remaining)}</span>}
        <button type="button" onClick={() => setPhase("done")} className="min-h-[44px] px-2 text-xs font-semibold text-muted-foreground">Finish</button>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-brand-600 transition-[width]" style={{ width: `${(pos / items.length) * 100}%` }} /></div>
      <QuestionCard key={item.id} classId={classId} item={item} onScore={(s) => record(item.id, s)} onNext={next} onBusy={setPaused} last={pos + 1 >= items.length} toast={toast} />
    </div>
  );
}

function QuestionCard({ classId, item, onScore, onNext, onBusy, last, toast }: { classId: string; item: SprintItem; onScore: (s: number) => void; onNext: () => void; onBusy: (b: boolean) => void; last: boolean; toast: ReturnType<typeof useToast>["toast"] }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [report, setReport] = useState<{ scoreAwarded: number; maxMarks: number; examinerAdvice?: string } | null>(null);
  const [needsPlan, setNeedsPlan] = useState(false);

  const [audio, setAudio] = useState<"idle" | "loading" | "playing">("idle");
  const el = useRef<HTMLAudioElement | null>(null);
  const listen = async () => {
    if (audio === "playing") {
      el.current?.pause();
      return setAudio("idle");
    }
    setAudio("loading");
    try {
      const res = await fetch("/api/practice/question-audio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classId, questionId: item.id, kind: item.kind }) });
      if (!res.ok) throw new Error("voice");
      const url = URL.createObjectURL(await res.blob());
      const a = new Audio(url);
      el.current = a;
      a.onended = () => setAudio("idle");
      await a.play();
      setAudio("playing");
    } catch {
      setAudio("idle");
      toast({ title: "Couldn't play the voice", description: "You can read the question instead.", variant: "destructive" });
    }
  };
  useEffect(() => () => el.current?.pause(), []);

  // speaking an answer: the browser's own speech recognition, so it costs nothing; typing always works
  const [listening, setListening] = useState(false);
  const rec = useRef<SpeechRec | null>(null);
  // where the browser has no speech recognition (some app browsers), the recording is sent to the cloud instead
  const [transcribing, setTranscribing] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const canRecord = typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  const canSpeak = typeof window !== "undefined" && (!!speechCtor() || canRecord);
  const recordToCloud = async () => {
    if (listening) {
      recorder.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const mr = new MediaRecorder(stream);
      recorder.current = mr;
      mr.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setListening(false);
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        if (blob.size < 1500) return toast({ title: "Didn't catch that", description: "Try again, or type your answer." });
        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append("audio", blob, "speech.webm");
          const res = await fetch("/api/stt", { method: "POST", body: fd });
          const j = await res.json().catch(() => null);
          const said = String(j?.data?.text || "").trim();
          if (!res.ok || !said) throw new Error("stt");
          setText((t) => (t ? `${t} ${said}` : said));
        } catch {
          toast({ title: "Couldn't turn that into text", description: "Type your answer instead.", variant: "destructive" });
        } finally {
          setTranscribing(false);
        }
      };
      mr.start();
      setListening(true);
      // a spoken answer is short; stop by itself after two minutes so a forgotten recording is not sent
      setTimeout(() => mr.state === "recording" && mr.stop(), 120_000);
    } catch {
      toast({ title: "Microphone not available", description: "Allow the microphone, or type your answer.", variant: "destructive" });
    }
  };
  const toggleMic = () => {
    if (listening) {
      rec.current?.stop();
      recorder.current?.stop();
      return;
    }
    const C = speechCtor();
    if (!C) {
      void recordToCloud();
      return;
    }
    const r = new C();
    r.continuous = true;
    r.interimResults = false;
    r.lang = "en-NG";
    r.onresult = (e) => {
      const said = Array.from(e.results).map((x) => x[0]?.transcript || "").join(" ").trim();
      if (said) setText((t) => (t ? `${t} ${said}` : said));
    };
    r.onend = () => setListening(false);
    r.onerror = () => {
      setListening(false);
      toast({ title: "Couldn't hear you", description: "Try again, or type your answer.", variant: "destructive" });
    };
    rec.current = r;
    r.start();
    setListening(true);
  };
  useEffect(() => () => rec.current?.stop(), []);

  const pickOption = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    onScore(i === item.correctIndex ? 1 : 0);
  };

  const snap = async (f: File | undefined) => {
    if (!f) return;
    try {
      setPhoto(await compressImage(f, 1280, 0.8));
    } catch {
      toast({ title: "Couldn't read that photo", description: "Try another one.", variant: "destructive" });
    }
  };

  const submit = async () => {
    if (!text.trim() && !photo) return toast({ title: "Add your answer first", description: "Type it, say it, or snap your paper work." });
    setMarking(true);
    onBusy(true);
    try {
      const res = await fetch(`/api/classes/${classId}/past-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "grade_handwritten", questionId: item.id, questionText: item.stem, topic: item.topic, maxMarks: item.marks, imageDataUrl: photo || undefined, writtenWork: text.trim() || undefined, dwellMs: 30_000 }),
      });
      const j = await res.json().catch(() => null);
      if (res.status === 403) return setNeedsPlan(true);
      if (!res.ok || !j?.data?.report) return toast({ title: "Couldn't mark that", description: j?.error?.message || "Try again.", variant: "destructive" });
      const rep = j.data.report as { scoreAwarded: number; maxMarks: number; examinerAdvice?: string };
      setReport(rep);
      onScore(rep.maxMarks ? rep.scoreAwarded / rep.maxMarks : 0);
    } catch {
      toast({ title: "Network error", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setMarking(false);
      onBusy(false);
    }
  };

  const answered = picked !== null || !!report;
  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{item.topic}{item.kind === "theory" ? ` · ${item.marks} marks` : ""}</p>
        <button type="button" onClick={listen} disabled={audio === "loading"} aria-label={audio === "playing" ? "Stop the voice" : "Listen to the question"} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted/60">
          {audio === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : audio === "playing" ? <Square className="h-4 w-4" /> : <Headphones className="h-4 w-4" />} {audio === "playing" ? "Stop" : "Listen"}
        </button>
      </div>
      <MarkdownRenderer content={item.stem} className="text-base font-medium leading-relaxed text-foreground prose-p:my-1" />

      {item.kind === "cbt" ? (
        <div className="space-y-2">
          {item.options.map((o, i) => {
            const right = picked !== null && i === item.correctIndex;
            const wrong = picked === i && i !== item.correctIndex;
            return (
              <button key={i} type="button" disabled={picked !== null} onClick={() => pickOption(i)} className={cn("flex min-h-[48px] w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm", picked === null && "border-border hover:border-brand-600 active:bg-brand-600/10", right && "border-emerald-500 bg-emerald-500/10", wrong && "border-rose-500 bg-rose-500/10", picked !== null && !right && !wrong && "opacity-60")}>
                <span className="flex-1 break-words"><MarkdownRenderer content={o} className="prose-p:my-0" /></span>
                {right && <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Correct" />}
                {wrong && <X className="h-4 w-4 shrink-0 text-rose-600" aria-label="Wrong" />}
              </button>
            );
          })}
          {picked !== null && item.explanation && <div className="rounded-xl bg-muted/60 p-3 text-sm"><MarkdownRenderer content={item.explanation} className="prose-p:my-1" /></div>}
        </div>
      ) : needsPlan ? (
        <div className="space-y-2 rounded-xl border border-border p-4 text-sm">
          <p className="font-semibold">Marking written answers is part of the Exam Pass.</p>
          <p className="text-muted-foreground">You can skip this one, or see the plans.</p>
          <div className="flex gap-2"><Link href="/plans"><Button size="sm">See plans</Button></Link><Button size="sm" variant="outline" onClick={onNext}>Skip</Button></div>
        </div>
      ) : report ? (
        <div className="space-y-2 rounded-xl border border-border p-4">
          <p className="text-lg font-semibold tabular-nums">{report.scoreAwarded} / {report.maxMarks}</p>
          {report.examinerAdvice && <MarkdownRenderer content={report.examinerAdvice} className="text-sm prose-p:my-1" />}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{item.needsPaper ? "Work this out on paper, then snap it. You can also type your steps." : canSpeak ? "Say your answer out loud, or type it. Use whichever suits where you are." : "Type your answer."}</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={item.needsPaper ? "Type your steps here (optional if you snap your paper)" : "Your answer"} aria-label="Your answer" className="w-full rounded-xl border border-border bg-background p-3 text-sm" />
          {photo && <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Photo added. <button type="button" onClick={() => setPhoto(null)} className="underline">Remove</button></p>}
          <div className="flex flex-wrap gap-2">
            {canSpeak && (
              <Button type="button" variant="outline" onClick={toggleMic} disabled={transcribing} className="min-h-[44px]">
                {transcribing ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Writing it down…</> : listening ? <><MicOff className="mr-1.5 h-4 w-4" /> Stop</> : <><Mic className="mr-1.5 h-4 w-4" /> Speak</>}
              </Button>
            )}
            <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted/60">
              <Camera className="h-4 w-4" aria-hidden="true" /> Snap paper
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void snap(e.target.files?.[0])} />
            </label>
            <Button type="button" onClick={() => void submit()} disabled={marking} className="min-h-[44px] flex-1">{marking ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Marking…</> : "Submit answer"}</Button>
          </div>
          <button type="button" onClick={onNext} className="min-h-[44px] text-xs font-semibold text-muted-foreground">Skip this question</button>
        </div>
      )}

      {answered && <Button className="w-full min-h-[44px]" onClick={onNext}>{last ? "See results" : "Next question"}</Button>}
    </Card>
  );
}
