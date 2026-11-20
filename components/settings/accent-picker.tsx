"use client";

import { Check, Palette } from "lucide-react";
import { usePrefs } from "./use-prefs";
import { ACCENTS, DEFAULT_ACCENT } from "@/lib/settings/accents";
import { cn } from "@/lib/utils";

/** Colour theme picker: choosing a swatch applies it live (AccessibilityApplier sets data-accent) and syncs to the account via usePrefs. */
export function AccentPicker() {
  const [prefs, update] = usePrefs();
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-brand-600"><Palette className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">Colour theme</p>
          <p className="text-xs text-slate-500">Pick the colour of buttons, links and highlights. Gold rewards and mastery colours stay the same.</p>
        </div>
        <button
          type="button"
          disabled={prefs.accent === DEFAULT_ACCENT}
          onClick={() => update({ accent: DEFAULT_ACCENT })}
          className="text-xs font-semibold text-brand-700 dark:text-brand-300 hover:underline disabled:opacity-40 disabled:no-underline"
        >
          Reset to Sunroot blue
        </button>
      </div>
      <div role="radiogroup" aria-label="Colour theme" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {ACCENTS.map((a) => {
          const active = prefs.accent === a.id;
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => update({ accent: a.id })}
              className={cn(
                "flex items-center gap-2 rounded-xl border p-2 text-left text-sm font-medium transition-colors",
                active ? "border-brand-600 bg-brand-50 dark:bg-brand-950" : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              )}
            >
              <span className="flex h-6 w-10 shrink-0 overflow-hidden rounded-md ring-1 ring-black/10" aria-hidden="true">
                {a.swatch.map((c) => (
                  <span key={c} className="flex-1" style={{ backgroundColor: c }} />
                ))}
              </span>
              <span className="min-w-0 flex-1 truncate">{a.label}</span>
              {active && <Check className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
