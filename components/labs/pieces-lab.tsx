"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { CheckCircle2, ChevronRight, Loader2, Sparkles, Target, XCircle } from "lucide-react";
import { frameHtmlFor } from "@/lib/sim/runtime3d";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface Piece {
  index: number;
  objective: string;
  status: "none" | "ready" | "generating" | "failed";
  html?: string;
  title?: string;
  goal?: string;
  howTo?: string[];
  concepts?: string[];
  error?: string;
  checkQuestion?: { question: string; options: string[] };
}

interface Props {
  classId: string;
  kcId: string;
  topicTitle: string;
  onEvidence?: (update: { pLAfter?: number; totalXp?: number }) => void;
}

/** One lab per learning objective ("piece"): a rail of pieces, the experiment in the centre, then a check. */
export function PiecesLab({ classId, kcId, topicTitle, onEvidence }: Props) {
  const { toast } = useToast();
  const [pieces, setPieces] = useState<Piece[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState<number | null>(null);
  const [solved, setSolved] = useState<Record<number, boolean>>({});
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<{ correct: boolean; explanation?: string; correctIndex: number } | null>(null);
  const [frameHtml, setFrameHtml] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/classes/${classId}/kcs/${kcId}/pieces`);
      const j = await res.json();
      if (j.ok) {
        setPieces(j.data.pieces);
        setCanManage(!!j.data.canManage);
      } else setPieces([]);
    } catch {
      setPieces([]);
    }
  }, [classId, kcId]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const piece = pieces?.[active];
  const html = piece?.html;
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      if (!alive) return;
      setFrameHtml(null);
      setPicked(null);
      setResult(null);
      if (html) frameHtmlFor(html).then((h) => alive && setFrameHtml(h)).catch(() => alive && setFrameHtml(html));
    }, 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [html, active]);

  const build = async (index: number) => {
    setBusy(index);
    try {
      const res = await fetch(`/api/classes/${classId}/kcs/${kcId}/pieces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index }),
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) {
        toast({ title: "Couldn't build this lab", description: j?.error?.message || "Please try again.", variant: "destructive" });
        return;
      }
      setPieces((prev) => prev?.map((p) => (p.index === index ? j.data.piece : p)) ?? prev);
    } finally {
      setBusy(null);
    }
  };

  const check = async (optionIndex: number) => {
    if (!piece || result) return;
    setPicked(optionIndex);
    try {
      const res = await fetch(`/api/classes/${classId}/kcs/${kcId}/pieces/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: piece.index, selectedOptionIndex: optionIndex }),
      });
      const j = await res.json();
      if (!j.ok) {
        toast({ title: "Couldn't check that", description: j.error?.message, variant: "destructive" });
        setPicked(null);
        return;
      }
      setResult(j.data);
      if (j.data.correct) {
        setSolved((s) => ({ ...s, [piece.index]: true }));
        confetti({ particleCount: 60, spread: 60, origin: { y: 0.7 } });
      }
      onEvidence?.({ pLAfter: j.data.pLAfter, totalXp: j.data.totalXp });
    } catch {
      setPicked(null);
    }
  };

  if (pieces === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading the pieces…
      </div>
    );
  }
  if (pieces.length === 0) {
    return <p className="text-sm text-muted-foreground">This topic has no learning objectives yet, so there are no pieces to practise.</p>;
  }

  const doneCount = Object.values(solved).length;
  const next = pieces[active + 1];

  return (
    <div className="grid gap-4 md:grid-cols-[230px_minmax(0,1fr)] items-start">
      <nav aria-label="Pieces of this topic" className="md:sticky md:top-20">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Pieces · {doneCount} of {pieces.length} checked
        </p>
        <ol className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-1 -mx-1 px-1">
          {pieces.map((p, i) => (
            <li key={p.index} className="shrink-0 md:shrink">
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-current={i === active ? "step" : undefined}
                className={cn(
                  "w-[190px] md:w-full text-left rounded-lg border px-3 py-2 text-sm flex gap-2.5 items-start transition-colors",
                  i === active ? "border-brand-500 bg-brand-500/10" : "border-border bg-card hover:border-brand-500/50"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 h-5 w-5 shrink-0 rounded-full text-[11px] font-bold flex items-center justify-center",
                    solved[p.index] ? "bg-brand-600 text-white" : "border border-border text-muted-foreground"
                  )}
                >
                  {solved[p.index] ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="line-clamp-3 leading-snug">{p.objective}</span>
                  <span className="block text-[11px] text-muted-foreground mt-0.5">
                    {p.status === "ready" ? "Lab ready" : p.status === "generating" ? "Building…" : "No lab yet"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="min-w-0 space-y-3">
        <div>
          <p className="text-xs font-semibold text-brand-600 dark:text-brand-400">Piece {active + 1} of {pieces.length}</p>
          <h3 className="text-lg font-bold leading-snug">{piece?.objective}</h3>
          <p className="text-xs text-muted-foreground">{topicTitle}</p>
        </div>

        {piece?.status === "ready" && piece.html ? (
          <>
            {piece.goal && (
              <p className="flex items-start gap-2 text-sm rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                <Target className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" /> {piece.goal}
              </p>
            )}
            <div className="rounded-xl overflow-hidden border border-border bg-[#0b0f14]">
              {frameHtml ? (
                <iframe
                  ref={frameRef}
                  title={piece.title || piece.objective}
                  srcDoc={frameHtml}
                  sandbox="allow-scripts allow-pointer-lock"
                  referrerPolicy="no-referrer"
                  className="w-full h-[min(70vh,560px)] min-h-[380px] block bg-[#0b0f14]"
                />
              ) : (
                <div className="w-full h-[380px] flex items-center justify-center text-xs text-slate-400" role="status">Loading the lab…</div>
              )}
            </div>
            {piece.howTo && piece.howTo.length > 0 && (
              <ol className="list-decimal pl-5 text-sm text-muted-foreground space-y-0.5">
                {piece.howTo.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            )}

            {piece.checkQuestion && (
              <Card className="p-4 space-y-3">
                <p className="text-sm font-semibold">Check: {piece.checkQuestion.question}</p>
                <div className="grid gap-2">
                  {piece.checkQuestion.options.map((o, i) => {
                    const isRight = result && i === result.correctIndex;
                    const isWrong = result && picked === i && !result.correct;
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={!!result}
                        onClick={() => check(i)}
                        className={cn(
                          "text-left rounded-lg border px-3 py-2 text-sm transition-colors",
                          isRight ? "border-brand-600 bg-brand-500/10" : isWrong ? "border-rose-500 cell-hatch" : "border-border hover:border-brand-500/60"
                        )}
                      >
                        <span className="flex items-start gap-2">
                          {isRight ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-brand-600" /> : isWrong ? <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-rose-600" /> : null}
                          <span>{o}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {result && (
                  <div className="text-sm space-y-2" role="status">
                    <p className="font-semibold">{result.correct ? "Correct." : "Not quite."}</p>
                    {result.explanation && <p className="text-muted-foreground">{result.explanation}</p>}
                    <div className="flex gap-2">
                      {!result.correct && <Button size="sm" variant="outline" onClick={() => { setPicked(null); setResult(null); }}>Try again</Button>}
                      {next && <Button size="sm" onClick={() => setActive(active + 1)}>Next piece <ChevronRight className="h-4 w-4 ml-1" /></Button>}
                    </div>
                  </div>
                )}
              </Card>
            )}
          </>
        ) : piece?.status === "generating" || busy === piece?.index ? (
          <Card className="p-6 text-sm flex items-center gap-3" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> Building the lab for this piece. This takes about a minute.
          </Card>
        ) : (
          <Card className="p-6 space-y-3">
            <p className="text-sm text-muted-foreground">
              {canManage
                ? "This piece has no lab yet. Build one that isolates just this idea: predict, experiment, then check."
                : "The teacher hasn't published a lab for this piece yet."}
            </p>
            {piece?.error && <p className="text-xs text-rose-600">{piece.error}</p>}
            {canManage && piece && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => build(piece.index)} isLoading={busy === piece.index}>
                  <Sparkles className="h-4 w-4 mr-1.5" /> Build this lab
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={async () => {
                    for (const p of pieces.filter((x) => x.status !== "ready")) await build(p.index);
                  }}
                >
                  Build all missing
                </Button>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
