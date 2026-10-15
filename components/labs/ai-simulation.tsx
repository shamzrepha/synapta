"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import {
  Sparkles,
  Maximize2,
  RotateCw,
  Wand2,
  Trophy,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Gamepad2,
  Undo2,
  PencilLine,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface ClientSimulation {
  status: "ready" | "generating" | "failed";
  html?: string;
  title?: string;
  goal?: string;
  howTo?: string[];
  concepts?: string[];
  version?: number;
  instructions?: string;
  error?: string;
  hasCheck: boolean;
  checkQuestion?: { question: string; options: string[] };
  canUndo?: boolean;
  editLog?: Array<{ version: number; kind: string; note: string; at: string }>;
}

type BuildMode = "create" | "edit";

export interface AiSimulationProps {
  classId: string;
  kcId: string;
  topicTitle: string;
  onEvidence?: (update: { pLAfter?: number; totalXp?: number }) => void;
}

const BUILD_STEPS = [
  "Reading the topic material…",
  "Designing the experiment and the challenge…",
  "Writing the physics and the visuals…",
  "Adding controls, scoring and levels…",
  "Polishing and checking the code…",
];

const EDIT_STEPS = [
  "Reading the current simulation…",
  "Applying your change…",
  "Keeping everything else the same…",
  "Checking the code still runs…",
];

const QUICK_EDITS = [
  "Make it easier for beginners",
  "Add one more, harder level",
  "Make text and controls bigger",
  "Show the formula and live values more clearly",
  "Add simple sound effects for success and failure",
];

const LETTERS = ["A", "B", "C", "D", "E", "F"];

interface SimPayload {
  simulation: ClientSimulation | null;
  canManage: boolean;
  canGenerate: boolean;
}

async function fetchSimulation(url: string): Promise<SimPayload | null> {
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.ok) return null;
    return {
      simulation: data.data.simulation,
      canManage: !!data.data.canManage,
      canGenerate: !!data.data.canGenerate,
    };
  } catch {
    return null;
  }
}

export function AiSimulation({ classId, kcId, topicTitle, onEvidence }: AiSimulationProps) {
  const { toast } = useToast();
  const [sim, setSim] = useState<ClientSimulation | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [canGenerate, setCanGenerate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [buildStep, setBuildStep] = useState(0);
  const [instructions, setInstructions] = useState("");
  const [changeRequest, setChangeRequest] = useState("");
  const [showDesigner, setShowDesigner] = useState(false);
  const [designerTab, setDesignerTab] = useState<"change" | "restart">("change");
  const [buildMode, setBuildMode] = useState<BuildMode>("create");
  const [undoing, setUndoing] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const [goalReached, setGoalReached] = useState<{ score?: number; level?: number } | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [showHowTo, setShowHowTo] = useState(true);

  const [checkSelected, setCheckSelected] = useState<number | null>(null);
  const [checkResult, setCheckResult] = useState<{ correct: boolean; correctIndex: number; explanation?: string } | null>(null);
  const [checking, setChecking] = useState(false);

  const frameRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const base = `/api/classes/${classId}/kcs/${kcId}/simulation`;

  const applyPayload = useCallback((payload: SimPayload | null) => {
    setLoading(false);
    if (!payload) return null;
    setSim(payload.simulation);
    setCanManage(payload.canManage);
    setCanGenerate(payload.canGenerate);
    if (payload.simulation?.instructions) setInstructions(payload.simulation.instructions);
    return payload.simulation;
  }, []);

  const load = useCallback(async () => applyPayload(await fetchSimulation(base)), [base, applyPayload]);

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  // Poll while another request (or a timed-out one) is still building on the server
  const startPolling = useCallback(() => {
    stopPolling();
    const started = Date.now();
    pollRef.current = setInterval(async () => {
      const s = await load();
      if (!s || s.status !== "generating" || Date.now() - started > 5 * 60 * 1000) {
        stopPolling();
        setBuilding(false);
      }
    }, 5000);
  }, [load]);

  useEffect(() => {
    fetchSimulation(base).then((payload) => {
      const s = applyPayload(payload);
      if (s?.status === "generating") {
        setBuildStep(0);
        setBuilding(true);
        startPolling();
      }
    });
    return stopPolling;
  }, [base, applyPayload, startPolling]);

  // Cycle the progress copy while building
  useEffect(() => {
    if (!building) return;
    const t = setInterval(() => setBuildStep((s) => Math.min(s + 1, BUILD_STEPS.length - 1)), 12000);
    return () => clearInterval(t);
  }, [building]);

  // Messages from the sandboxed simulation (only from our own iframe)
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return;
      const msg = e.data as { source?: string; type?: string; detail?: Record<string, unknown> | null };
      if (!msg || msg.source !== "synapta-sim") return;
      if (msg.type === "goal_complete") {
        const detail = (msg.detail || {}) as { score?: number; level?: number };
        setGoalReached(detail);
        confetti({ particleCount: 90, spread: 65, origin: { y: 0.4 } });
      } else if (msg.type === "runtime_error") {
        setRuntimeError(String(msg.detail?.message || "Script error"));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const resetPlayState = () => {
    setRuntimeError(null);
    setGoalReached(null);
    setCheckResult(null);
    setCheckSelected(null);
  };

  /**
   * mode "create": build from scratch (first build or "start over").
   * mode "edit":   send the current code + a change request (or a runtime error) and change only that.
   */
  const build = async (opts: { mode?: BuildMode; previousError?: string } = {}) => {
    const mode = opts.mode || "create";
    setBuildMode(mode);
    setBuildStep(0);
    setBuilding(true);
    resetPlayState();
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          instructions: canManage && mode === "create" ? instructions : undefined,
          changeRequest: canManage && mode === "edit" ? changeRequest : undefined,
          previousError: opts.previousError,
        }),
      });
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        setSim(data.data.simulation);
        setFrameKey((k) => k + 1);
        setShowDesigner(false);
        setBuilding(false);
        if (mode === "edit") setChangeRequest("");
        toast({
          title: mode === "edit" ? (opts.previousError ? "Simulation fixed" : "Change applied") : "Simulation ready",
          description: mode === "edit" ? "Not what you wanted? Use Undo to go back." : "Have fun experimenting!",
          variant: "success",
        });
        return;
      }
      if (data?.error?.code === "SIM_GENERATING" || data?.error?.code === "SIM_EXISTS" || !data) {
        // Someone else is building it, or our request outlived the gateway: keep watching
        startPolling();
        return;
      }
      setBuilding(false);
      toast({
        title: mode === "edit" ? "Couldn't apply the change" : "Couldn't build the simulation",
        description: data.error?.message,
        variant: "destructive",
      });
      load();
    } catch {
      startPolling();
    }
  };

  const undo = async () => {
    setUndoing(true);
    try {
      const res = await fetch(`${base}/undo`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setSim(data.data.simulation);
        setFrameKey((k) => k + 1);
        resetPlayState();
        toast({ title: "Went back to the previous version", variant: "success" });
      } else {
        toast({ title: "Couldn't undo", description: data.error?.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setUndoing(false);
    }
  };

  const submitCheck = async () => {
    if (checkSelected === null || checking) return;
    setChecking(true);
    try {
      const res = await fetch(`${base}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedOptionIndex: checkSelected }),
      });
      const data = await res.json();
      if (data.ok) {
        setCheckResult({ correct: data.data.correct, correctIndex: data.data.correctIndex, explanation: data.data.explanation });
        onEvidence?.({ pLAfter: data.data.pLAfter, totalXp: data.data.totalXp });
        if (data.data.correct && data.data.credited) {
          toast({ title: "Lab complete! +30 XP", description: "Your mastery has been updated.", variant: "success" });
        }
      } else {
        toast({ title: "Not recorded", description: data.error?.message, variant: data.error?.code === "LAB_RATE_LIMITED" ? "amber" : "destructive" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  const goFullscreen = () => {
    const el = stageRef.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => null);
  };

  // ---------- Loading / building ----------
  if (loading) {
    return <div className="h-[420px] rounded-2xl bg-slate-100 dark:bg-slate-900 animate-pulse" />;
  }

  const steps = buildMode === "edit" ? EDIT_STEPS : BUILD_STEPS;
  if (building) {
    return (
      <div className="h-[420px] rounded-2xl border border-teal-500/30 bg-gradient-to-br from-slate-950 to-slate-900 text-slate-100 flex flex-col items-center justify-center gap-5 p-6 text-center">
        <div className="relative h-16 w-16">
          <div className="absolute inset-0 rounded-full border-4 border-teal-500/20" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-teal-400 animate-spin" />
          <Gamepad2 className="absolute inset-0 m-auto h-7 w-7 text-amber-400" />
        </div>
        <div className="space-y-1.5">
          <p className="font-bold text-lg">{buildMode === "edit" ? "Updating your simulation" : "Building your simulation"}</p>
          <p className="text-sm text-teal-300">{steps[Math.min(buildStep, steps.length - 1)]}</p>
          <p className="text-xs text-slate-400">This usually takes 30–90 seconds. You can keep studying in another tab.</p>
        </div>
        <div className="flex gap-1.5">
          {steps.map((_, i) => (
            <span key={i} className={cn("h-1.5 w-8 rounded-full", i <= buildStep ? "bg-teal-400" : "bg-slate-700")} />
          ))}
        </div>
      </div>
    );
  }

  const createPanel = (
    <div className="space-y-3">
      <Textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder={`e.g. "A game where students adjust launch angle and speed to hit castle targets, with wind in level 3" — leave empty and the AI designs it from the topic.`}
        className="text-sm"
      />
      {sim?.html && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          This writes a completely new simulation. The current one is saved, so you can Undo.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => build({ mode: "create" })}>
          <Sparkles className="h-4 w-4 mr-1.5" /> {sim?.html ? "Start over from scratch" : "Build simulation"}
        </Button>
        {sim?.html && (
          <Button size="sm" variant="outline" onClick={() => setShowDesigner(false)}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );

  const designer = canManage && (
    <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-4 space-y-3">
      {sim?.html ? (
        <>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/60 dark:bg-slate-900/60 w-fit">
            <button
              type="button"
              onClick={() => setDesignerTab("change")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5",
                designerTab === "change" ? "bg-indigo-600 text-white" : "text-slate-600 dark:text-slate-300"
              )}
            >
              <PencilLine className="h-3.5 w-3.5" /> Change this simulation
            </button>
            <button
              type="button"
              onClick={() => setDesignerTab("restart")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5",
                designerTab === "restart" ? "bg-indigo-600 text-white" : "text-slate-600 dark:text-slate-300"
              )}
            >
              <Sparkles className="h-3.5 w-3.5" /> Start over
            </button>
          </div>

          {designerTab === "change" ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Describe what to add or change. The AI edits the current simulation and keeps everything else as it is.
              </p>
              <Textarea
                value={changeRequest}
                onChange={(e) => setChangeRequest(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder={`e.g. "Make the ball red and twice as big", "Add a wind slider in level 2", "Rename 'Fire' to 'Launch'"`}
                className="text-sm"
              />
              <div className="flex flex-wrap gap-1.5">
                {QUICK_EDITS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setChangeRequest((prev) => (prev.trim() ? `${prev.trim()}\n${q}` : q))}
                    className="px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 text-[11px] hover:border-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300"
                  >
                    + {q}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => build({ mode: "edit" })} disabled={!changeRequest.trim()}>
                  <PencilLine className="h-4 w-4 mr-1.5" /> Apply change
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowDesigner(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            createPanel
          )}

          {sim.editLog && sim.editLog.length > 0 && (
            <div className="pt-3 border-t border-indigo-500/20 space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <History className="h-3.5 w-3.5" /> Recent changes
              </p>
              <ul className="space-y-1">
                {[...sim.editLog].reverse().slice(0, 5).map((e) => (
                  <li key={`${e.version}-${e.at}`} className="text-xs text-slate-600 dark:text-slate-400 flex gap-2">
                    <span className="font-mono text-slate-400 shrink-0">v{e.version}</span>
                    <span className="min-w-0 truncate">{e.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-indigo-500" />
            <p className="font-semibold text-sm">Describe the simulation you want</p>
          </div>
          {createPanel}
        </>
      )}
    </div>
  );

  // ---------- Empty state ----------
  if (!sim?.html) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center space-y-4">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-gradient-to-br from-teal-500 to-amber-500 text-white flex items-center justify-center shadow-lg">
            <Gamepad2 className="h-7 w-7" />
          </div>
          <div>
            <h3 className="font-bold text-lg">Interactive simulation</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
              Turn <strong>{topicTitle}</strong> into a playable experiment: change the variables, watch what happens, and beat the challenge.
            </p>
          </div>
          {sim?.status === "failed" && sim.error && (
            <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 rounded-xl p-2 max-w-md mx-auto">{sim.error}</p>
          )}
          {canGenerate && !canManage && (
            <Button onClick={() => build({ mode: "create" })}>
              <Sparkles className="h-4 w-4 mr-1.5" /> Build the simulation
            </Button>
          )}
          {!canGenerate && (
            <p className="text-xs text-slate-500">Enroll in this class to unlock its simulations.</p>
          )}
        </div>
        {designer}
      </div>
    );
  }

  // ---------- Ready ----------
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="amber" className="text-[10px]">
              <Gamepad2 className="h-3 w-3 mr-1" /> AI simulation
            </Badge>
            {canManage && sim.version ? <Badge variant="outline" className="text-[10px]">v{sim.version}</Badge> : null}
          </div>
          <h3 className="font-bold text-lg leading-tight">{sim.title}</h3>
          {sim.goal && (
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              <span className="font-semibold text-amber-600 dark:text-amber-400">Challenge:</span> {sim.goal}
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => { setFrameKey((k) => k + 1); setRuntimeError(null); setGoalReached(null); }} title="Restart simulation">
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={goFullscreen} title="Full screen">
            <Maximize2 className="h-4 w-4" />
          </Button>
          {canManage && sim.canUndo && (
            <Button size="sm" variant="outline" onClick={undo} isLoading={undoing} title="Go back to the previous version">
              <Undo2 className="h-4 w-4 mr-1" /> Undo
            </Button>
          )}
          {canManage && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDesignerTab("change");
                setShowDesigner((v) => !v);
              }}
            >
              <Wand2 className="h-4 w-4 mr-1" /> Edit
            </Button>
          )}
        </div>
      </div>

      {showDesigner && designer}

      {sim.howTo && sim.howTo.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setShowHowTo((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300"
          >
            How to play
            <ChevronDown className={cn("h-4 w-4 transition-transform", showHowTo && "rotate-180")} />
          </button>
          {showHowTo && (
            <ol className="px-4 pb-3 space-y-1 text-xs text-slate-600 dark:text-slate-400 list-decimal list-inside">
              {sim.howTo.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ol>
          )}
        </div>
      )}

      <div ref={stageRef} className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-[#0b0f14] shadow-lg">
        <iframe
          key={frameKey}
          ref={frameRef}
          title={sim.title || `${topicTitle} simulation`}
          srcDoc={sim.html}
          // allow-scripts WITHOUT allow-same-origin: the simulation runs in an opaque origin and
          // cannot read cookies, storage or anything in the app.
          sandbox="allow-scripts allow-pointer-lock"
          referrerPolicy="no-referrer"
          className="w-full h-[min(75vh,640px)] min-h-[420px] block bg-[#0b0f14]"
        />
      </div>

      {runtimeError && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <span className="flex-1 min-w-0">
            The simulation hit an error{canManage ? `: ${runtimeError}` : ". Try restarting it."}
          </span>
          {canManage && (
            <Button size="sm" variant="outline" onClick={() => build({ mode: "edit", previousError: runtimeError })}>
              <Wand2 className="h-3.5 w-3.5 mr-1" /> Auto-fix
            </Button>
          )}
        </div>
      )}

      {goalReached && (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-sm">
          <Trophy className="h-5 w-5 text-amber-500 shrink-0" />
          <span>
            <strong>Challenge complete!</strong>
            {typeof goalReached.score === "number" ? ` Score: ${goalReached.score}.` : ""} Now lock in your mastery with the check below.
          </span>
        </div>
      )}

      {sim.checkQuestion && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-teal-500" />
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Check your understanding · earns lab credit</p>
          </div>
          <MarkdownRenderer content={sim.checkQuestion.question} className="font-semibold prose-p:my-0" />
          <div className="space-y-2">
            {sim.checkQuestion.options.map((opt, idx) => {
              const picked = checkSelected === idx;
              const isRight = checkResult && idx === checkResult.correctIndex;
              const isWrongPick = checkResult && picked && !checkResult.correct;
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={!!checkResult}
                  onClick={() => setCheckSelected(idx)}
                  className={cn(
                    "w-full text-left p-3 rounded-xl border-2 flex items-start gap-3 transition-all",
                    checkResult
                      ? isRight
                        ? "border-emerald-500 bg-emerald-500/10"
                        : isWrongPick
                        ? "border-rose-500 bg-rose-500/10"
                        : "border-slate-200 dark:border-slate-800 opacity-60"
                      : picked
                      ? "border-teal-500 bg-teal-500/10"
                      : "border-slate-200 dark:border-slate-800 hover:border-teal-400/60"
                  )}
                >
                  <span className={cn("h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-[11px] font-bold", picked || isRight ? "bg-teal-600 text-white" : "bg-slate-100 dark:bg-slate-800")}>
                    {LETTERS[idx]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <MarkdownRenderer content={opt} className="prose-p:my-0" />
                  </div>
                  {isRight && <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />}
                  {isWrongPick && <XCircle className="h-5 w-5 text-rose-500 shrink-0" />}
                </button>
              );
            })}
          </div>
          {checkResult ? (
            <div className="space-y-3">
              <div className={cn("p-3 rounded-xl text-sm border", checkResult.correct ? "border-emerald-500/40 bg-emerald-500/5" : "border-rose-500/40 bg-rose-500/5")}>
                <p className="font-bold mb-1">{checkResult.correct ? "Correct!" : "Not quite."}</p>
                {checkResult.explanation && <MarkdownRenderer content={checkResult.explanation} className="prose-p:my-0 text-sm" />}
              </div>
              {!checkResult.correct && (
                <Button size="sm" variant="outline" onClick={() => { setCheckResult(null); setCheckSelected(null); }}>
                  Experiment more, then try again
                </Button>
              )}
            </div>
          ) : (
            <Button size="sm" onClick={submitCheck} disabled={checkSelected === null} isLoading={checking}>
              Check answer
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
