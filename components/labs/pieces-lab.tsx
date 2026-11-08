"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { CheckCircle2, ChevronLeft, ChevronRight, ListChecks, Loader2, Maximize2, Minimize2, Play, Sparkles, Star, Target, XCircle } from "lucide-react";
import { frameHtmlFor } from "@/lib/sim/runtime3d";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { RichInline } from "@/components/markdown/rich-inline";
import { TutorBubble, parseTutorMessage, type TutorMessage } from "./tutor-bubble";
import { readableText } from "@/lib/text/readable";
import { QuestRunner } from "@/components/quest/quest-runner";
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

interface QuestInfo {
  index: number;
  status: "none" | "ready" | "generating" | "failed";
  count: number;
  error?: string;
}

interface Props {
  classId: string;
  kcId: string;
  topicTitle: string;
  onEvidence?: (update: { pLAfter?: number; totalXp?: number }) => void;
}

/** One lab per learning objective ("piece"): a rail of pieces, the experiment in the centre, then a check. Goes full screen on any device. */
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
  const [tutor, setTutor] = useState<TutorMessage | null>(null);
  const [stars, setStars] = useState(0);
  const [full, setFull] = useState(false);
  const [quests, setQuests] = useState<QuestInfo[]>([]);
  const [questBusy, setQuestBusy] = useState<number | null>(null);
  const [runIndex, setRunIndex] = useState<number | null>(null);
  const [view, setView] = useState<"quest" | "lab">("quest");
  const [sheet, setSheet] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const usedApi = useRef(false);
  const msgId = useRef(0);

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
    try {
      const r = await fetch(`/api/classes/${classId}/kcs/${kcId}/quests`);
      const j = await r.json();
      if (j.ok) setQuests(j.data.quests);
    } catch {}
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
      setTutor(null);
      setSheet(false);
      if (html) frameHtmlFor(html).then((h) => alive && setFrameHtml(h)).catch(() => alive && setFrameHtml(html));
    }, 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [html, active]);

  // Messages from the lab (only from our own frame): the tutor speaking, stars earned, goal reached
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return;
      const m = e.data as { source?: string; type?: string; detail?: Record<string, unknown> | null };
      if (!m || (m.source !== "sunroot-sim" && m.source !== "synapta-sim")) return;
      const say = parseTutorMessage(m.type, m.detail, ++msgId.current);
      if (say) setTutor(say);
      else if (m.type === "award") {
        const n = Math.max(0, Math.min(3, Number(m.detail?.stars) || 0));
        if (n) setStars((s) => s + n);
        confetti({ particleCount: 40, spread: 50, origin: { y: 0.8 }, scalar: 0.8 });
      } else if (m.type === "goal_complete") {
        confetti({ particleCount: 90, spread: 65, origin: { y: 0.5 } });
        setTutor({ id: ++msgId.current, tone: "praise", text: "Goal reached. Now answer the check question to lock it in." });
        setSheet(true);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Full screen: the browser API where it exists, a fixed full-window layout everywhere else (iPhone Safari has no API for it)
  const enterFull = () => {
    setFull(true);
    const el = wrapRef.current;
    if (el?.requestFullscreen) {
      usedApi.current = true;
      el.requestFullscreen().catch(() => {
        usedApi.current = false;
      });
    }
    try {
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      if (window.matchMedia("(pointer: coarse)").matches) o.lock?.("landscape")?.catch(() => null);
    } catch {}
  };
  const exitFull = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => null);
    usedApi.current = false;
    try {
      screen.orientation.unlock();
    } catch {}
    setFull(false);
  }, []);
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && usedApi.current) {
        usedApi.current = false;
        setFull(false);
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && exitFull();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [full, exitFull]);

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

  const buildQuest = async (index: number) => {
    setQuestBusy(index);
    try {
      const res = await fetch(`/api/classes/${classId}/kcs/${kcId}/quests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index }),
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) {
        toast({ title: "Couldn't build the challenges", description: j?.error?.message || "Please try again.", variant: "destructive" });
        return;
      }
      setQuests((qs) => qs.map((q) => (q.index === index ? { ...q, status: "ready", count: j.data.count, error: undefined } : q)));
    } finally {
      setQuestBusy(null);
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
        setStars((s) => s + 1);
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
  const prev = pieces[active - 1];

  const checkCard = piece?.checkQuestion && (
    <Card className="p-4 space-y-3">
      <p className="text-sm font-semibold">
        Check: <RichInline text={piece.checkQuestion.question} />
      </p>
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
                "text-left rounded-lg border px-3 py-2.5 text-sm transition-colors min-h-11",
                isRight ? "border-brand-600 bg-brand-500/10" : isWrong ? "border-rose-500 cell-hatch" : "border-border hover:border-brand-500/60"
              )}
            >
              <span className="flex items-start gap-2">
                {isRight ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-brand-600" /> : isWrong ? <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-rose-600" /> : null}
                <RichInline text={o} />
              </span>
            </button>
          );
        })}
      </div>
      {result && (
        <div className="text-sm space-y-2" role="status">
          <p className="font-semibold">{result.correct ? "Correct." : "Not quite."}</p>
          {result.explanation && <p className="text-muted-foreground"><RichInline text={result.explanation} /></p>}
          <div className="flex gap-2">
            {!result.correct && <Button size="sm" variant="outline" onClick={() => { setPicked(null); setResult(null); }}>Try again</Button>}
            {next && result.correct && <Button size="sm" onClick={() => setActive(active + 1)}>Next piece <ChevronRight className="h-4 w-4 ml-1" /></Button>}
          </div>
        </div>
      )}
    </Card>
  );

  const frame = frameHtml ? (
    <iframe
      ref={frameRef}
      title={readableText(piece?.title || piece?.objective)}
      srcDoc={frameHtml}
      sandbox="allow-scripts allow-pointer-lock"
      referrerPolicy="no-referrer"
      className={cn("w-full block bg-[#0b0f14]", full ? "h-full" : "h-[min(70vh,560px)] min-h-[380px]")}
    />
  ) : (
    <div className={cn("w-full flex items-center justify-center text-xs text-slate-400", full ? "h-full" : "h-[380px]")} role="status">Loading the lab…</div>
  );

  const labReady = piece?.status === "ready" && !!piece.html;
  const questOf = (i: number) => quests.find((q) => q.index === i);
  const quest = piece ? questOf(piece.index) : undefined;

  const questCard = piece && (
    <Card className="p-5 space-y-4">
      {quest?.status === "ready" ? (
        <>
          <div>
            <p className="text-sm font-semibold">Quest: {quest.count} short challenges</p>
            <p className="text-sm text-muted-foreground">One task at a time: tap, drag and slide your way through. Anything you miss comes back until you get it.</p>
          </div>
          <Button onClick={() => setRunIndex(piece.index)} className="w-full sm:w-auto">
            <Play className="h-4 w-4 mr-1.5" /> Start quest
          </Button>
        </>
      ) : quest?.status === "generating" || questBusy === piece.index ? (
        <p className="flex items-center gap-3 text-sm" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Building the challenges for this piece…</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {canManage ? "No challenges for this piece yet. Build a quest of short game-like tasks that test just this idea." : "The teacher hasn't published the challenges for this piece yet."}
          </p>
          {quest?.error && <p className="text-xs text-rose-600">{quest.error}</p>}
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => buildQuest(piece.index)} isLoading={questBusy === piece.index}>
                <Sparkles className="h-4 w-4 mr-1.5" /> Build challenges
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={questBusy !== null}
                onClick={async () => {
                  for (const q of quests.filter((x) => x.status !== "ready")) await buildQuest(q.index);
                }}
              >
                Build for all pieces
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );

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
                  <span className="line-clamp-3 leading-snug">{readableText(p.objective)}</span>
                  <span className="block text-[11px] text-muted-foreground mt-0.5">
                    {questOf(p.index)?.status === "ready" ? `Quest · ${questOf(p.index)?.count} tasks` : p.status === "ready" ? "Lab ready" : p.status === "generating" ? "Building…" : "Not built yet"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="min-w-0 space-y-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-brand-600 dark:text-brand-400">Piece {active + 1} of {pieces.length}</p>
            <h3 className="text-lg font-bold leading-snug"><RichInline text={piece?.objective || ""} /></h3>
            <p className="text-xs text-muted-foreground">{topicTitle}</p>
          </div>
          {stars > 0 && (
            <span className="flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-400" aria-label={`${stars} stars earned`}>
              <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" /> {stars}
            </span>
          )}
        </div>

        <div className="inline-flex rounded-lg border border-border p-0.5 text-sm" role="tablist" aria-label="How to practise this piece">
          {(["quest", "lab"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn("rounded-md px-3 py-1.5 font-semibold", view === v ? "bg-brand-600 text-white" : "text-muted-foreground")}
            >
              {v === "quest" ? "Quest" : "Explore lab"}
            </button>
          ))}
        </div>

        {view === "quest" ? questCard : labReady ? (
          <>
            {piece?.goal && !full && (
              <p className="flex items-start gap-2 text-sm rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                <Target className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" /> <RichInline text={piece.goal} />
              </p>
            )}

            {/* The stage: inline on the page, or a full-window layout (header, lab, tutor, check drawer) */}
            <div
              ref={wrapRef}
              className={cn(
                full
                  ? "fixed inset-0 z-[100] flex flex-col bg-[#0b0f14] text-slate-100 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
                  : "relative rounded-xl overflow-hidden border border-border bg-[#0b0f14]"
              )}
            >
              {full && (
                <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
                  <Button size="sm" variant="outline" onClick={() => prev && setActive(active - 1)} disabled={!prev} aria-label="Previous piece">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {active + 1}/{pieces.length} · {readableText(piece?.objective)}
                  </p>
                  {stars > 0 && (
                    <span className="flex items-center gap-1 text-xs font-bold text-amber-400"><Star className="h-3.5 w-3.5 fill-amber-400" /> {stars}</span>
                  )}
                  {piece?.checkQuestion && (
                    <Button size="sm" variant="outline" onClick={() => setSheet((v) => !v)}>
                      <ListChecks className="h-4 w-4 mr-1" /> Check
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => next && setActive(active + 1)} disabled={!next} aria-label="Next piece">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button size="sm" onClick={exitFull} aria-label="Exit full screen">
                    <Minimize2 className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <div className={cn("relative", full && "flex-1 min-h-0")}>
                {frame}
                <TutorBubble message={tutor} className="absolute left-2 right-12 bottom-2 sm:left-3 sm:bottom-3" />
                {!full && (
                  <button
                    type="button"
                    onClick={enterFull}
                    className="absolute right-2 top-2 flex h-9 items-center gap-1.5 rounded-lg bg-black/55 px-2.5 text-xs font-semibold text-white backdrop-blur hover:bg-black/70"
                    aria-label="Full screen"
                  >
                    <Maximize2 className="h-4 w-4" /> <span className="hidden sm:inline">Full screen</span>
                  </button>
                )}
                {full && sheet && checkCard && (
                  <div className="absolute inset-x-0 bottom-0 max-h-[70%] overflow-y-auto bg-background text-foreground border-t border-border p-3 shadow-2xl">
                    {piece?.goal && (
                      <p className="mb-2 flex items-start gap-2 text-xs text-muted-foreground"><Target className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" /> <RichInline text={piece.goal} /></p>
                    )}
                    {checkCard}
                  </div>
                )}
              </div>
            </div>

            {piece?.howTo && piece.howTo.length > 0 && !full && (
              <ol className="list-decimal pl-5 text-sm text-muted-foreground space-y-0.5">
                {piece.howTo.map((s, i) => <li key={i}><RichInline text={s} /></li>)}
              </ol>
            )}
            {!full && checkCard}
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
      {runIndex !== null && (
        <QuestRunner
          classId={classId}
          kcId={kcId}
          index={runIndex}
          objective={pieces[runIndex]?.objective || ""}
          onExit={() => {
            setRunIndex(null);
            void load();
          }}
          onFinished={(r) => {
            setSolved((s) => ({ ...s, [runIndex]: true }));
            onEvidence?.({ pLAfter: r.pLAfter, totalXp: r.totalXp });
          }}
          onNextPiece={
            pieces[runIndex + 1]
              ? () => {
                  setActive(runIndex + 1);
                  setRunIndex(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
