"use client";

import React, { useEffect, useRef, useState } from "react";
import { Globe, Check } from "lucide-react";
import { usePrefs } from "./use-prefs";
import { useT } from "./use-t";
import { LANGUAGES, languageInfo } from "@/lib/i18n/languages";
import { cn } from "@/lib/utils";

function LanguageList({ onPick }: { onPick?: () => void }) {
  const [prefs, update] = usePrefs();
  return (
    <ul role="listbox" aria-label="Language" className="grid gap-1">
      {LANGUAGES.map((l) => {
        const on = prefs.language === l.code;
        return (
          <li key={l.code}>
            <button
              type="button"
              role="option"
              aria-selected={on}
              onClick={() => {
                update({ language: l.code });
                onPick?.();
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800",
                on && "bg-teal-500/10 font-semibold text-teal-800 dark:text-teal-300"
              )}
            >
              <span className="flex-1">
                <span dir={l.rtl ? "rtl" : undefined}>{l.native}</span>
                {l.native !== l.name && <span className="ml-1.5 text-xs font-normal text-slate-500">{l.name}</span>}
              </span>
              {l.voiceBeta && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300" title="Spoken with a Nigerian English voice for now">voice beta</span>}
              {on && <Check className="h-4 w-4 text-teal-600" aria-hidden />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Full picker for the Settings page. */
export function LanguageSettings() {
  const t = useT();
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-teal-600"><Globe className="h-5 w-5" /></span>
        <div>
          <p className="font-semibold text-sm">{t("Language")}</p>
          <p className="text-xs text-slate-500">{t("The AI teaches, quizzes and talks to you in this language.")}</p>
        </div>
      </div>
      <LanguageList />
    </div>
  );
}

/** Globe button in the top bar: switch language from anywhere. */
export function LanguageMenu() {
  const [prefs] = usePrefs();
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${t("Language")}: ${languageInfo(prefs.language).name}`}
        aria-expanded={open}
        title={t("Language")}
        className="flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 hover:text-teal-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
      >
        <Globe className="h-4 w-4" />
        <span className="uppercase">{prefs.language}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-950">
          <LanguageList onPick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
