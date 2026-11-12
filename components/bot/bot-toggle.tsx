"use client";

import React from "react";
import { Bot } from "lucide-react";
import { useBot } from "@/components/bot/bot-provider";

/** Settings row: turn Sprout, the helper bot, on or off. */
export function BotToggle() {
  const { enabled, setEnabled } = useBot();
  return (
    <div className="flex items-center gap-3 p-4">
      <span className="text-brand-600"><Bot className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm">Sprout, the helper bot</p>
        <p className="text-xs text-slate-500">A little bot that runs to the word you tap, flips pages and crosses out terms. Turn it off for a calmer screen.</p>
      </div>
      <button
        role="switch"
        aria-checked={enabled}
        aria-label="Sprout, the helper bot"
        onClick={() => setEnabled(!enabled)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${enabled ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-700"}`}
      >
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
