"use client";

import React, { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  EXPLAIN_LEVELS,
  EXPLAIN_LEVEL_LABELS,
  EXPLAIN_LEVEL_STORAGE_KEY,
  parseExplainLevel,
  type ExplainLevel,
} from "@/lib/study/explain-level";

/** Remembers the chosen explanation level in this browser. */
export function useExplainLevel(): [ExplainLevel, (l: ExplainLevel) => void] {
  const [level, setLevelState] = useState<ExplainLevel>("standard");
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setLevelState(parseExplainLevel(localStorage.getItem(EXPLAIN_LEVEL_STORAGE_KEY)));
      } catch {
        // storage unavailable
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const setLevel = useCallback((l: ExplainLevel) => {
    setLevelState(l);
    try {
      localStorage.setItem(EXPLAIN_LEVEL_STORAGE_KEY, l);
    } catch {
      // storage unavailable
    }
  }, []);
  return [level, setLevel];
}

/** Simple / Standard / Lecturer segmented switch. */
export function ExplainLevelToggle({
  value,
  onChange,
  className,
}: {
  value: ExplainLevel;
  onChange: (l: ExplainLevel) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label="Explanation level" className={cn("inline-flex rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-50 dark:bg-slate-900", className)}>
      {EXPLAIN_LEVELS.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={value === l}
          onClick={() => onChange(l)}
          className={cn(
            "h-8 px-2.5 rounded-md text-xs font-semibold transition-colors",
            value === l ? "bg-teal-600 text-white" : "text-slate-500 hover:text-teal-700 dark:hover:text-teal-300"
          )}
        >
          {EXPLAIN_LEVEL_LABELS[l]}
        </button>
      ))}
    </div>
  );
}
