"use client";

import React, { useEffect, useRef, useState } from "react";
import { Volume2, Square, Loader2 } from "lucide-react";
import { createSpeaker, type Speaker } from "@/lib/audio/speak";
import { useAccessibility } from "@/components/settings/use-accessibility";
import type { TtsSpeed } from "@/lib/settings/accessibility";
import { cn } from "@/lib/utils";

const SPEEDS: TtsSpeed[] = [0.85, 1, 1.25];

/** Reads text aloud with the app's neural voice (real audio from /api/tts) with speed & progress controls. */
export function ReadAloud({
  text,
  className,
  showSpeed = false,
  label = "Listen",
}: {
  text: string;
  className?: string;
  showSpeed?: boolean;
  label?: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "speaking">("idle");
  const [progress, setProgress] = useState<{ cur: number; total: number } | null>(null);
  const [a11y, updateA11y] = useAccessibility();
  const speaker = useRef<Speaker | null>(null);
  useEffect(() => () => speaker.current?.stop(), []);

  useEffect(() => {
    speaker.current?.setRate(a11y.ttsSpeed);
  }, [a11y.ttsSpeed]);

  const toggle = () => {
    if (state !== "idle") {
      speaker.current?.stop();
      setState("idle");
      setProgress(null);
      return;
    }
    speaker.current ||= createSpeaker();
    setState("loading");
    speaker.current.say(
      text,
      () => {
        setState("idle");
        setProgress(null);
      },
      () => {
        setState("idle");
        setProgress(null);
      },
      {
        rate: a11y.ttsSpeed,
        onProgress: (cur, total) => {
          setState("speaking");
          setProgress(total > 1 ? { cur, total } : null);
        },
      }
    );
  };

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <button
        type="button"
        onClick={toggle}
        aria-label={state === "idle" ? "Read aloud" : "Stop reading"}
        title={state === "idle" ? "Read aloud" : "Stop"}
        className={cn(
          "inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors",
          className
        )}
      >
        {state === "loading" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-600" />
        ) : state === "speaking" ? (
          <Square className="h-3.5 w-3.5 text-rose-500" />
        ) : (
          <Volume2 className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
        )}
        <span>
          {state === "idle" ? label : progress ? `Stop (${progress.cur}/${progress.total})` : "Stop"}
        </span>
      </button>
      {showSpeed && (
        <span className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden" role="group" aria-label="Read aloud speed">
          {SPEEDS.map((sp) => (
            <button
              key={sp}
              type="button"
              onClick={() => updateA11y({ ttsSpeed: sp })}
              aria-pressed={a11y.ttsSpeed === sp}
              className={cn(
                "px-1.5 py-0.5 text-[10px] font-bold transition-colors",
                a11y.ttsSpeed === sp
                  ? "bg-teal-600 text-white"
                  : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              )}
            >
              {sp}×
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
