"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, Loader2, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { asArray, fetchJson } from "@/lib/api/client";
import { compressImage } from "@/lib/image-compress";
import { DIFFICULTIES, MAX_ANSWER_CHARS, STRICTNESS, type Difficulty, type MarkingResult, type PublicQuestion, type Strictness } from "@/lib/practice/theory/schemas";
import { cn } from "@/lib/utils";

export interface WrittenSource {
  classId?: string;
  kcId?: string;
  noteId?: string;
}

interface Outcome {
  result: MarkingResult;
  evidence: { credited: boolean; reason?: string };
}

const STRICT_COPY: Record<Strictness, { label: string; hint: string }> = {
  strict: { label: "Strict", hint: "Close to the textbook. Key terms, units and formulas must appear, and vague answers lose marks." },
  balanced: { label: "Balanced", hint: "The key ideas must be there. Your own wording is fine." },
  lenient: { label: "Lenient", hint: "A correct idea in your own words earns the marks. Good for first attempts." },
};
const DIFF_LABEL: Record<Difficulty, string> = { easy: "Easier", medium: "Exam level", hard: "Tricky" };

/** Reads and writes the draft; storage can be blocked (private window), so every access is guarded. */
const draftKey = (scope: string, qid: string) => `written-draft:${scope}:${qid}`;
function readDraft(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
function writeDraft(key: string, value: string) {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable: the answer still works, it just isn't kept */
  }
}

function Ring({ score, marks }: { score: number; marks: number }) {
  const pct = marks > 0 ? Math.min(1, score / marks) : 0;
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-24 w-24 shrink-0" role="img" aria-label={`${score} out of ${marks} marks`}>
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="8" className="stroke-slate-200 dark:stroke-slate-700" />
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} className="stroke-brand-600 transition-[stroke-dashoffset] duration-700" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-tight">
        <span className="text-xl font-bold tabular-nums">{score}</span>
        <span className="text-[11px] text-muted-foreground">out of {marks}</span>
      </div>
    </div>
  );
}

export function WrittenPractice({ source, title }: { source: WrittenSource; title?: string }) {
  const scope = source.noteId ? `note:${source.noteId}` : `kc:${source.classId}:${source.kcId}`;
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [strictness, setStrictness] = useState<Strictness>("balanced");
  const [questions, setQuestions] = useState<PublicQuestion[] | null>(null);
  const [setTitle, setSetTitle] = useState(title || "");
  const [current, setCurrent] = useState(0);
  const [answer, setAnswer] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState<"" | "set" | "mark" | "photo">("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const question = questions ? questions[current] : undefined;

  // restore the saved draft when a question opens
  useEffect(() => {
    if (!question) return;
    const t = setTimeout(() => setAnswer(readDraft(draftKey(scope, question.id))), 0);
    return () => clearTimeout(t);
  }, [question, scope]);

  const start = async () => {
    setBusy("set");
    setError("");
    const j = await fetchJson<{ title: string; questions: PublicQuestion[] }>("/api/practice/theory/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...source, difficulty }),
    });
    setBusy("");
    if (!j.ok) return setError(j.error.message);
    const qs = asArray<PublicQuestion>(j.data.questions);
    if (qs.length === 0) return setError("No questions came back. Please try again.");
    setQuestions(qs);
    setSetTitle(j.data.title || title || "");
    setCurrent(0);
    setOutcome(null);
  };

  const submit = async () => {
    if (!question) return;
    setBusy("mark");
    setError("");
    const j = await fetchJson<Outcome>("/api/practice/theory/mark", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...source, difficulty, strictness, questionId: question.id, answer }),
    });
    setBusy("");
    if (!j.ok) return setError(j.error.message);
    writeDraft(draftKey(scope, question.id), "");
    setOutcome(j.data);
  };

  // optional: a photo of the handwritten answer is read into the box so the learner can fix it before marking
  const readPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy("photo");
    setError("");
    try {
      const image = await compressImage(file, 1600, 0.8);
      const j = await fetchJson<{ pages: string[] }>("/api/documents/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ images: [image] }) });
      if (!j.ok) setError(j.error.message);
      else setAnswer(asArray<string>(j.data.pages).join("\n").slice(0, MAX_ANSWER_CHARS));
    } catch {
      setError("Couldn't read that photo. Try a clearer one.");
    }
    setBusy("");
  };

  const next = () => {
    setOutcome(null);
    setAnswer("");
    setError("");
    setCurrent((c) => c + 1);
  };

  const left = questions ? questions.length - current - 1 : 0;
  const parts = useMemo(() => asArray<MarkingResult["points"][number]>(outcome?.result.points), [outcome]);

  // ------------------------------------------------------------------ setup
  if (!questions) {
    return (
      <Card className="p-4 md:p-6 space-y-5">
        <div>
          <h2 className="text-lg font-bold">Written practice</h2>
          <p className="text-sm text-muted-foreground">{setTitle ? `Exam-style questions on ${setTitle}. ` : ""}Type your answers the way you would write them in the exam, and get them marked against a marking guide.</p>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-xs font-bold uppercase tracking-wide text-muted-foreground">How hard</legend>
          <div className="grid grid-cols-3 gap-2">
            {DIFFICULTIES.map((d) => (
              <button key={d} type="button" aria-pressed={difficulty === d} onClick={() => setDifficulty(d)} className={cn("rounded-lg border px-2 py-2.5 text-sm font-semibold", difficulty === d ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 dark:border-slate-700 hover:border-brand-500")}>
                {DIFF_LABEL[d]}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-xs font-bold uppercase tracking-wide text-muted-foreground">How strict is the marker</legend>
          <div className="grid gap-2">
            {STRICTNESS.map((s) => (
              <button key={s} type="button" aria-pressed={strictness === s} onClick={() => setStrictness(s)} className={cn("rounded-lg border px-3 py-2.5 text-left", strictness === s ? "border-brand-600 bg-brand-600/10" : "border-slate-300 dark:border-slate-700 hover:border-brand-500")}>
                <span className="text-sm font-semibold">{STRICT_COPY[s].label}</span>
                <span className="block text-xs text-muted-foreground">{STRICT_COPY[s].hint}</span>
              </button>
            ))}
          </div>
        </fieldset>
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        <Button className="w-full" size="lg" disabled={busy === "set"} onClick={start}>
          {busy === "set" ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Setting your questions…</> : "Start"}
        </Button>
      </Card>
    );
  }
  if (!question) return null;

  // ------------------------------------------------------------------ question and result
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Question {current + 1} of {questions.length}</span>
        <span>{STRICT_COPY[strictness].label} marking</span>
      </div>
      <Card className="p-4 md:p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-brand-600">{question.command}</p>
            <MarkdownRenderer content={question.question} className="text-base font-medium" localized />
          </div>
          <span className="shrink-0 rounded-md bg-brand-600/10 px-2 py-1 text-xs font-bold text-brand-700 dark:text-brand-300">{question.marks} marks</span>
        </div>

        {!outcome && (
          <>
            <Textarea
              value={answer}
              maxLength={MAX_ANSWER_CHARS}
              rows={9}
              placeholder="Write your answer here, as you would in the exam…"
              aria-label="Your answer"
              onChange={(e) => setAnswer(e.target.value)}
              disabled={busy === "mark"}
            />
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="tabular-nums">{answer.length} / {MAX_ANSWER_CHARS}</span>
              <button type="button" className="font-semibold text-brand-600 hover:underline" onClick={() => writeDraft(draftKey(scope, question.id), answer)}>Save draft</button>
              <button type="button" className="ml-auto inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline disabled:opacity-50" disabled={busy !== ""} onClick={() => fileRef.current?.click()}>
                {busy === "photo" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />} Photo of my handwritten answer
              </button>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void readPhoto(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
            {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
            <Button className="w-full" size="lg" disabled={busy !== "" || !answer.trim()} onClick={submit}>
              {busy === "mark" ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Marking…</> : "Mark my answer"}
            </Button>
          </>
        )}
      </Card>

      {outcome && (
        <>
          <Card className="p-4 md:p-5 space-y-4">
            <div className="flex items-center gap-4">
              <Ring score={outcome.result.score} marks={outcome.result.marks} />
              <p className="text-sm leading-relaxed">{outcome.result.feedback}</p>
            </div>
            <ul className="space-y-2">
              {parts.map((p, i) => (
                <li key={i} className="flex gap-2 rounded-lg border border-slate-200 dark:border-slate-800 p-2.5 text-sm">
                  <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white", p.status === "hit" ? "bg-teal-600" : p.status === "partial" ? "bg-brand-500" : "bg-rose-600")} aria-hidden>
                    {p.status === "hit" ? <Check className="h-3.5 w-3.5" /> : p.status === "partial" ? <Minus className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{p.point} <span className="text-xs font-normal text-muted-foreground tabular-nums">({p.awarded} of {p.marks}, {p.status === "hit" ? "got it" : p.status === "partial" ? "partly" : "missed"})</span></p>
                    {p.quote && <p className="text-xs text-muted-foreground">You wrote: &ldquo;{p.quote}&rdquo;</p>}
                    {p.note && <p className="text-xs text-muted-foreground">{p.note}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-4 md:p-5 space-y-3">
            <h3 className="text-sm font-bold">Model answer</h3>
            <MarkdownRenderer content={outcome.result.modelAnswer} localized />
            {outcome.result.tip && (
              <p className="rounded-lg bg-brand-600/10 p-3 text-sm"><span className="font-bold">How to write this in the exam: </span>{outcome.result.tip}</p>
            )}
            {outcome.evidence.reason && <p className="text-xs text-muted-foreground">{outcome.evidence.reason}</p>}
            {outcome.evidence.credited && <p className="text-xs text-muted-foreground">This counted toward your mastery of the topic.</p>}
          </Card>
          <div className="flex gap-2">
            {left > 0 ? (
              <Button className="flex-1" size="lg" onClick={next}>Try another question</Button>
            ) : (
              <Button className="flex-1" size="lg" onClick={() => { setQuestions(null); setOutcome(null); setAnswer(""); }}>Try a new set</Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
