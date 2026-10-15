"use client";

import React, { useState } from "react";
import { CheckCircle2, Circle, ChevronDown, Loader2, Send, Sparkles, PlayCircle, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { StepVideos } from "./videos";
import type { DesignSpec } from "@/lib/studio/spec";
import type { StepResult } from "@/lib/studio/verify";
import type { Gap } from "@/lib/studio/circuit/checker";
import { cn } from "@/lib/utils";

export type GuideMode = "learn" | "practice" | "challenge";

interface Props {
  designId: string;
  spec: DesignSpec;
  /** saved, server-verified progress */
  progress: Record<string, { done: boolean; verified?: boolean }>;
  /** instant client-side check of the working copy */
  live: Record<string, StepResult>;
  gaps: Gap[];
  mode: GuideMode;
  onMode: (m: GuideMode) => void;
  lockedMode?: boolean;
  canEdit: boolean;
  checking: string | null;
  onCheck: (stepId: string) => void;
  testResults: Array<{ title: string; pass: boolean; message: string }>;
}

interface Msg {
  role: "user" | "model";
  text: string;
}

/**
 * Step-by-step build guide (SunRoot's ContextualTutor idea): mission steps with automatic checks,
 * "what to do next" computed from the live design, YouTube lessons per step, and an AI tutor whose
 * hint depth follows the learning mode.
 */
export function GuidePanel({ designId, spec, progress, live, gaps, mode, onMode, lockedMode, canEdit, checking, onCheck, testResults }: Props) {
  const firstOpen = spec.steps.findIndex((s) => !progress[s.id]?.done);
  const [open, setOpen] = useState<string | null>(spec.steps[firstOpen >= 0 ? firstOpen : 0]?.id || null);
  const [videosFor, setVideosFor] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const done = spec.steps.filter((s) => progress[s.id]?.done).length;
  const current = spec.steps[firstOpen >= 0 ? firstOpen : spec.steps.length - 1];

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || asking) return;
    setInput("");
    const history = msgs.slice(-6);
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setAsking(true);
    try {
      const j = await fetch(`/api/studio/designs/${designId}/help`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, mode, spec, history, testResults, currentStep: current?.title }),
      }).then((r) => r.json());
      setMsgs((m) => [...m, { role: "model", text: j.ok ? j.data.answer : j.error?.message || "The tutor is unavailable right now." }]);
    } catch {
      setMsgs((m) => [...m, { role: "model", text: "The tutor is unavailable right now." }]);
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-slate-200 dark:border-slate-800 p-0.5 text-xs font-semibold" role="tablist" aria-label="Learning mode">
          {(["learn", "practice", "challenge"] as GuideMode[]).map((m) => (
            <button key={m} type="button" disabled={lockedMode} onClick={() => onMode(m)} className={cn("px-3 py-1.5 rounded-lg capitalize", mode === m ? "bg-teal-600 text-white" : "text-slate-500")}>
              {m}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500">
          {mode === "learn" ? "Full explanations" : mode === "practice" ? "Hints point at the problem" : "Questions only — no answers"}
        </span>
      </div>

      {spec.steps.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-sm font-bold">Build steps</p>
            <span className="text-xs text-slate-500">
              {done}/{spec.steps.length} done
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 mb-3 overflow-hidden">
            <div className="h-full bg-teal-500 transition-all" style={{ width: `${(done / Math.max(1, spec.steps.length)) * 100}%` }} />
          </div>
          <ol className="space-y-2">
            {spec.steps.map((s, i) => {
              const isDone = !!progress[s.id]?.done;
              const l = live[s.id];
              const isOpen = open === s.id;
              return (
                <li key={s.id} className={cn("rounded-xl border", isDone ? "border-emerald-500/40 bg-emerald-500/5" : "border-slate-200 dark:border-slate-800")}>
                  <button type="button" onClick={() => setOpen(isOpen ? null : s.id)} className="w-full flex items-center gap-2 px-3 py-2 text-left">
                    {isDone ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> : <Circle className="h-4 w-4 text-slate-400 shrink-0" />}
                    <span className="text-sm font-semibold flex-1">
                      {i + 1}. {s.title}
                    </span>
                    {!isDone && l?.done && s.check.kind !== "manual" && <span className="text-[10px] font-bold text-emerald-600">READY ✓</span>}
                    <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", isOpen && "rotate-180")} />
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 space-y-2">
                      <div className="text-sm text-slate-700 dark:text-slate-300">
                        <MarkdownRenderer content={s.detail} />
                      </div>
                      {l && s.check.kind !== "manual" && !isDone && <p className={cn("text-xs", l.done ? "text-emerald-600" : "text-amber-600")}>{l.done ? "✓ " : "• "}{l.message}</p>}
                      <div className="flex flex-wrap gap-2">
                        {canEdit && !isDone && (
                          <Button size="sm" onClick={() => onCheck(s.id)} isLoading={checking === s.id}>
                            {s.check.kind === "manual" ? "Mark done" : "Check step"}
                          </Button>
                        )}
                        {s.videoQuery && (
                          <Button size="sm" variant="outline" onClick={() => setVideosFor(videosFor === s.id ? null : s.id)}>
                            <PlayCircle className="h-4 w-4 mr-1 text-rose-600" /> {videosFor === s.id ? "Hide videos" : "Watch"}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => ask(`I'm on step "${s.title}". What should I do and why?`)}>
                          <Sparkles className="h-4 w-4 mr-1" /> Help with this step
                        </Button>
                      </div>
                      {videosFor === s.id && s.videoQuery && <StepVideos query={s.videoQuery} />}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {gaps.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-1.5">
          <p className="text-sm font-bold flex items-center gap-1.5">
            <Lightbulb className="h-4 w-4 text-amber-500" /> What to do next
          </p>
          {gaps.slice(0, mode === "learn" ? 3 : 1).map((g) => (
            <div key={g.id} className="text-sm">
              {mode !== "challenge" && <p className="font-semibold">{g.title}</p>}
              {mode === "learn" && <p className="text-xs text-slate-600 dark:text-slate-400">{g.hint}</p>}
              {mode !== "learn" && <p className="text-xs text-slate-600 dark:text-slate-400 italic">{g.question}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800">
        <p className="px-3 pt-2 text-sm font-bold flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-teal-600" /> AI tutor
        </p>
        <div className="max-h-80 overflow-y-auto px-3 py-2 space-y-2">
          {msgs.length === 0 && <p className="text-xs text-slate-500">Ask about your wiring, code, gears or forces. The tutor sees your current design and test results.</p>}
          {msgs.map((m, i) => (
            <div key={i} className={cn("rounded-xl px-3 py-2 text-sm", m.role === "user" ? "bg-teal-600 text-white ml-8" : "bg-slate-50 dark:bg-slate-900 mr-4")}>
              {m.role === "user" ? m.text : <MarkdownRenderer content={m.text} />}
            </div>
          ))}
          {asking && (
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
            </p>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="flex gap-2 p-2 border-t border-slate-100 dark:border-slate-800"
        >
          <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={2000} placeholder="Why won't my LED light?" className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm" />
          <button type="submit" disabled={asking || !input.trim()} aria-label="Ask" className="h-10 w-10 rounded-xl bg-teal-600 text-white flex items-center justify-center disabled:opacity-40">
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
