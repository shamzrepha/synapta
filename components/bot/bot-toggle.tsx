"use client";

import React from "react";
import Link from "next/link";
import { Bot } from "lucide-react";
import { useBot, type BotMode } from "@/components/bot/bot-provider";
import { cn } from "@/lib/utils";

const MODES: Array<{ id: BotMode; label: string }> = [
  { id: "lively", label: "Lively" },
  { id: "calm", label: "Calm" },
  { id: "off", label: "Off" },
];

/** Settings row: how much Sprout moves around, and a way into its wardrobe. */
export function BotToggle() {
  const { mode, setMode, pet } = useBot();
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-3">
        <span className="text-brand-600"><Bot className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">{pet.name}, your helper bot</p>
          <p className="text-xs text-slate-500">Runs to the word you tap, flips pages, cheers your progress. Lively adds waves and dances while you read; Calm only moves when you ask; Off hides it.</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border p-0.5 text-xs font-semibold" role="group" aria-label="Helper bot energy">
          {MODES.map((m) => (
            <button key={m.id} type="button" onClick={() => setMode(m.id)} aria-pressed={mode === m.id} className={cn("px-3 py-1.5 rounded-md", mode === m.id ? "bg-brand-600 text-white" : "text-muted-foreground hover:text-foreground")}>
              {m.label}
            </button>
          ))}
        </div>
        <Link href="/pet" className="text-xs font-semibold text-brand-600 dark:text-brand-400 underline">Name it and dress it up</Link>
      </div>
    </div>
  );
}
