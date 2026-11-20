"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Monitor, Moon, Palette, Sun, X } from "lucide-react";
import { usePrefs } from "./use-prefs";
import { useTheme } from "@/components/providers/theme-provider";
import { ACCENT_PICKER_GROUPS, DEFAULT_ACCENT, type ColorMode } from "@/lib/settings/accents";
import { cn } from "@/lib/utils";

const MODES: { id: ColorMode; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

/**
 * The one theme picker: a Light / Dark / System switch, every theme grouped (Soft, Bold, Cool and neutral) with a page+card+accent
 * swatch, and a reset. Tapping a theme applies it instantly (AccessibilityApplier sets data-accent), saves it on this device and syncs it
 * to the account. Used by the topbar popover (ThemeMenu) and by Settings (AccentPicker).
 */
export function ThemePanel() {
  const [prefs, update] = usePrefs();
  const { theme, mode, setMode } = useTheme();
  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Light or dark" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
        {MODES.map((m) => {
          const on = mode === m.id;
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setMode(m.id)}
              className={cn(
                "flex min-h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                on ? "bg-card text-brand-700 shadow-sm dark:text-brand-300" : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" /> {m.label}
            </button>
          );
        })}
      </div>

      {ACCENT_PICKER_GROUPS.map(({ group, items }) => (
        <div key={group} role="radiogroup" aria-label={`${group} themes`}>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">{group}</p>
          <div className="grid grid-cols-2 gap-2">
            {items.map((a) => {
              const active = prefs.accent === a.id;
              const sw = theme === "dark" ? a.dark : a.light;
              return (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => update({ accent: a.id })}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-xl border p-1.5 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                    active ? "border-brand-600 bg-brand-500/10" : "border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  )}
                >
                  <span className="flex h-8 w-11 shrink-0 overflow-hidden rounded-md ring-1 ring-black/15" aria-hidden="true">
                    <span className="flex-[2]" style={{ backgroundColor: sw[0] }} />
                    <span className="flex-1" style={{ backgroundColor: sw[1] }} />
                    <span className="flex-1" style={{ backgroundColor: sw[2] }} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{a.label}</span>
                  {active && <Check className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <button
        type="button"
        disabled={prefs.accent === DEFAULT_ACCENT}
        onClick={() => update({ accent: DEFAULT_ACCENT })}
        className="min-h-11 w-full rounded-xl border border-slate-200 text-sm font-semibold text-brand-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-40 dark:border-slate-700 dark:text-brand-300 dark:hover:bg-slate-800"
      >
        Reset to Sunroot blue
      </button>
    </div>
  );
}

/** Palette button for the topbar and the More page: opens ThemePanel as a popover (desktop) or a bottom sheet (phones). */
export function ThemeMenu({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Colours and theme"
        title="Colours and theme"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-card/70 text-brand-600 shadow-xs transition-colors hover:border-brand-500/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-400"
      >
        <Palette className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/40 sm:hidden" aria-hidden="true" />
          <div
            role="dialog"
            aria-label="Colours and theme"
            className="fixed inset-x-0 bottom-0 z-[70] max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-border bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-11 sm:max-h-[min(36rem,calc(100dvh-5rem))] sm:w-[22rem] sm:rounded-2xl sm:pb-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold">Colours and theme</p>
              <button
                ref={closeRef}
                type="button"
                onClick={() => {
                  setOpen(false);
                  btnRef.current?.focus();
                }}
                aria-label="Close"
                className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <ThemePanel />
          </div>
        </>
      )}
    </div>
  );
}
