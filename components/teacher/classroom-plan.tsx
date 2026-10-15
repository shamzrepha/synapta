"use client";

import React from "react";
import { Gamepad2, Zap, Hammer, CalendarClock, Headphones, MessagesSquare, Lightbulb, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ClassroomPlan {
  summary: string;
  outline: Array<{ title: string; why: string; week?: number }>;
  interactiveIdeas: Array<{ type: string; title: string; description: string; forTopic?: string | null }>;
  tips: string[];
}

const TYPE_META: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  simulation: { label: "Simulation", icon: <Gamepad2 className="h-3.5 w-3.5" />, className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  quiz_sprint: { label: "Quiz sprint", icon: <Zap className="h-3.5 w-3.5" />, className: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  hackathon: { label: "Hackathon", icon: <Hammer className="h-3.5 w-3.5" />, className: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" },
  study_session: { label: "Study session", icon: <CalendarClock className="h-3.5 w-3.5" />, className: "bg-teal-500/10 text-teal-700 dark:text-teal-300" },
  audio: { label: "Audio lesson", icon: <Headphones className="h-3.5 w-3.5" />, className: "bg-purple-500/10 text-purple-700 dark:text-purple-300" },
  discussion: { label: "Discussion", icon: <MessagesSquare className="h-3.5 w-3.5" />, className: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
};

/** Renders an AI classroom plan: suggested outline, interactive activities and tips. */
export function ClassroomPlanView({ plan, compact = false }: { plan: ClassroomPlan; compact?: boolean }) {
  return (
    <div className="space-y-4">
      {plan.summary && <p className="text-sm text-slate-700 dark:text-slate-300">{plan.summary}</p>}

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <ListOrdered className="h-3.5 w-3.5" /> Suggested outline ({plan.outline.length} topics)
        </p>
        <ol className={cn("space-y-1.5", compact && "max-h-56 overflow-y-auto pr-1")}>
          {plan.outline.map((o, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className="shrink-0 w-6 text-right font-bold text-slate-400">{i + 1}.</span>
              <span>
                <span className="font-semibold">{o.title}</span>
                {o.week ? <span className="text-[11px] text-slate-400"> · wk {o.week}</span> : null}
                {o.why && <span className="block text-xs text-slate-500">{o.why}</span>}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {plan.interactiveIdeas.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Interactive ideas</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {plan.interactiveIdeas.map((idea, i) => {
              const meta = TYPE_META[idea.type] || TYPE_META.discussion;
              return (
                <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-1">
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", meta.className)}>
                    {meta.icon} {meta.label}
                  </span>
                  <p className="text-sm font-semibold leading-snug">{idea.title}</p>
                  {idea.description && <p className="text-xs text-slate-500">{idea.description}</p>}
                  {idea.forTopic && <p className="text-[11px] text-slate-400">Topic: {idea.forTopic}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {plan.tips.length > 0 && (
        <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 space-y-1">
          <p className="text-xs font-bold flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
            <Lightbulb className="h-3.5 w-3.5" /> Tips
          </p>
          <ul className="text-xs text-slate-600 dark:text-slate-400 list-disc list-inside space-y-0.5">
            {plan.tips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function outlineToText(plan: ClassroomPlan): string {
  return plan.outline.map((o, i) => `${i + 1}. ${o.title}`).join("\n");
}
