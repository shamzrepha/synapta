"use client";

import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, BookOpen, CheckCircle2, Flag, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RichInline } from "@/components/markdown/rich-inline";
import { Widget, type Answer } from "@/components/quest/quest-runner";
import type { ClientChallenge } from "@/lib/quest/schema";
import type { Activity } from "@/lib/worlds/activities";
import { gradeCloze, gradeMatching, gradeOrdering } from "@/lib/worlds/grade";
import type { ActivityResult } from "@/lib/worlds/memory";
import { SourceDrawer } from "./source-drawer";
import { cn } from "@/lib/utils";

function shuffled<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface CardResult extends Omit<ActivityResult, "kuId"> {
  kuId: string;
}

interface Props {
  worldId: string;
  activity: Activity;
  critical?: boolean;
  /** called once the student has answered; the card then shows feedback and a Continue button */
  onAnswered?: (r: CardResult) => void;
  onNext: (r: CardResult) => void;
  nextLabel?: string;
}

/** One activity: the question, the answer controls, instant feedback with the reason and a link to her own notes. */
export function ActivityCard({ worldId, activity: a, critical, onAnswered, onNext, nextLabel = "Continue" }: Props) {
  const started = useRef(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [typed, setTyped] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState<CardResult | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    started.current = Date.now();
  }, [a.id]);

  // order and matching are shuffled for the student; the correct order is the notes' order
  // (the parent gives each card a key, so this is computed once per activity)
  const [challenge] = useState<ClientChallenge | null>(() => {
    if (a.template === "ordering") return { id: a.id, type: "order", prompt: "Put these in the right order.", items: shuffled(a.items) };
    if (a.template === "matching") return { id: a.id, type: "match", prompt: "Match each pair.", lefts: a.pairs.map((p) => p.left), rights: shuffled(a.pairs.map((p) => p.right)) };
    return null;
  });

  const finish = (correct: boolean, selfRating?: CardResult["selfRating"]) => {
    // runs from a tap or key press, never during render
    // eslint-disable-next-line react-hooks/purity
    const r: CardResult = { kuId: a.kuIds[0], template: a.template, correct, firstTry: true, ms: Date.now() - started.current, hintsUsed: 0, ...(selfRating ? { selfRating } : {}) };
    setResult(r);
    onAnswered?.(r);
  };

  const check = () => {
    if (a.template === "cloze") return finish(gradeCloze(a, typed));
    if (a.template === "ordering" && answer?.type === "order") return finish(gradeOrdering(a, answer.order));
    if (a.template === "matching" && answer?.type === "match") return finish(gradeMatching(a, answer.pairs));
  };

  const ready = a.template === "cloze" ? typed.trim().length > 0 : a.template === "ordering" ? answer?.type === "order" && answer.order.length === a.items.length : a.template === "matching" ? answer?.type === "match" && answer.pairs.length === a.pairs.length : false;

  const report = async () => {
    setReported(true);
    await fetch("/api/worlds/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ worldId, activityId: a.id, kind: "unclear" }) }).catch(() => null);
  };

  const prompt = a.template === "flip_recall" ? a.prompt : a.template === "mcq" ? a.stem : a.template === "cloze" ? "Fill in the missing word." : a.template === "ordering" ? "Put these in the right order." : "Match each pair.";

  return (
    <div className="space-y-4">
      {critical && (
        <p className="inline-flex items-center gap-1.5 rounded-md border border-orange-500/50 bg-orange-500/10 px-2 py-1 text-xs font-semibold text-orange-700 dark:text-orange-300"><AlertTriangle className="h-3.5 w-3.5" /> Safety-critical</p>
      )}
      <div className="rounded-xl border border-border bg-card px-4 py-3 text-base leading-snug shadow-sm"><RichInline text={prompt} /></div>

      {a.template === "flip_recall" && (
        <div className="space-y-3">
          {!revealed && !result ? (
            <Button className="w-full h-12" variant="outline" onClick={() => setRevealed(true)}>Show answer</Button>
          ) : (
            <>
              <div className="rounded-lg border-2 border-brand-600/50 bg-brand-500/10 px-4 py-3 font-semibold"><RichInline text={a.answer} /></div>
              {!result && (
                <div className="grid grid-cols-4 gap-2" role="group" aria-label="How well did you know it?">
                  {(["again", "hard", "good", "easy"] as const).map((r) => (
                    <Button key={r} variant={r === "good" ? "default" : "outline"} onClick={() => finish(r !== "again", r)} className="h-11 capitalize">{r}</Button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {a.template === "mcq" && (
        <div className="grid gap-2" role="group" aria-label="Choose one answer">
          {a.options.map((o, i) => {
            const isRight = !!result && i === a.correctIndex;
            const isPicked = answer?.type === "choose" && answer.index === i;
            const isWrong = !!result && isPicked && i !== a.correctIndex;
            return (
              <button
                key={i}
                type="button"
                disabled={!!result}
                onClick={() => {
                  setAnswer({ type: "choose", index: i });
                  finish(i === a.correctIndex);
                }}
                className={cn("text-left rounded-lg border-2 px-4 py-3 text-base min-h-14 transition-colors", isRight ? "border-teal-600 bg-teal-500/10" : isWrong ? "border-orange-500 cell-hatch" : "border-border bg-card hover:border-brand-500/50")}
              >
                <span className="flex items-start gap-2">
                  {isRight ? <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0 text-teal-600" /> : isWrong ? <XCircle className="h-5 w-5 mt-0.5 shrink-0 text-orange-600" /> : <span className="mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border text-xs font-bold">{i + 1}</span>}
                  <RichInline text={o} />
                </span>
              </button>
            );
          })}
        </div>
      )}

      {a.template === "cloze" && (
        <div className="space-y-2">
          <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-base leading-relaxed"><RichInline text={a.text} /></p>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={!!result}
            aria-label="The missing word"
            placeholder="Type the missing word"
            autoCapitalize="off"
            autoComplete="off"
            onKeyDown={(e) => e.key === "Enter" && ready && !result && check()}
            className="h-14 w-full rounded-lg border-2 border-border bg-card px-4 text-lg outline-none focus:border-brand-600"
          />
        </div>
      )}

      {challenge && <Widget c={challenge} answer={answer} setAnswer={setAnswer} locked={!!result} />}

      {!result && (a.template === "cloze" || a.template === "ordering" || a.template === "matching") && (
        <Button className="w-full h-12" onClick={check} disabled={!ready}>Check</Button>
      )}

      {result && (
        <div className={cn("rounded-xl border p-4 space-y-3", result.correct ? "border-teal-600/50 bg-teal-500/10" : "border-orange-500/50 bg-orange-500/10 cell-hatch")} role="status" aria-live="polite">
          <p className={cn("flex items-center gap-2 font-bold", result.correct ? "text-teal-700 dark:text-teal-300" : "text-orange-700 dark:text-orange-300")}>
            {result.correct ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
            {result.correct ? "Right." : a.template === "flip_recall" ? "Noted. This one comes back soon." : "Not quite. It comes back soon."}
          </p>
          {!result.correct && a.template === "cloze" && <p className="text-sm"><span className="font-semibold">Answer: </span>{a.blanks[0].answer}</p>}
          {!result.correct && a.template === "ordering" && <ol className="list-decimal pl-5 text-sm space-y-0.5">{a.items.map((it, i) => <li key={i}>{it}</li>)}</ol>}
          {!result.correct && a.template === "matching" && <ul className="text-sm space-y-0.5">{a.pairs.map((p, i) => <li key={i}>{p.left} → {p.right}</li>)}</ul>}
          <p className="text-sm text-muted-foreground"><RichInline text={a.explain} /></p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowSource(true)}><BookOpen className="h-4 w-4 mr-1.5" /> View in my notes</Button>
            <button type="button" onClick={report} disabled={reported} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"><Flag className="h-3.5 w-3.5" /> {reported ? "Thanks, reported" : "Report a problem"}</button>
          </div>
          <Button className="w-full h-12" onClick={() => onNext(result)}>{nextLabel}</Button>
        </div>
      )}
      {showSource && a.anchors[0] && <SourceDrawer anchor={a.anchors[0]} onClose={() => setShowSource(false)} />}
    </div>
  );
}
