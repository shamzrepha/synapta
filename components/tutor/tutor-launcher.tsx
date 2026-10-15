"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, X, Maximize2 } from "lucide-react";
import { TutorChat } from "./tutor-chat";

/** Pages with their own chat box, where a floating button would cover the input */
const HIDDEN_PREFIXES = ["/tutor", "/messages", "/notebook", "/lounge/"];

function contextFromPath(pathname: string): { classId: string; kcId: string } {
  const m = /^\/classes\/([^/]+)(?:\/topics\/([^/]+))?/.exec(pathname);
  if (!m || ["manage", "heatmap", "new", "create"].includes(m[1])) return { classId: "", kcId: "" };
  return { classId: m[1], kcId: m[2] || "" };
}

/** Floating "Ask tutor" button + panel available on every app page. */
export function TutorLauncher() {
  const pathname = usePathname() || "";
  const [open, setOpen] = useState(false);
  const ctx = contextFromPath(pathname);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p)) || /\/topics\//.test(pathname)) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed z-40 right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] md:bottom-6 md:right-6 flex items-center gap-2 h-12 pl-3.5 pr-4 rounded-full bg-teal-600 text-white font-semibold text-sm shadow-xl shadow-teal-900/20 hover:bg-teal-700"
          aria-label="Ask the AI tutor"
        >
          <Sparkles className="h-5 w-5" />
          <span className="hidden sm:inline">Ask tutor</span>
        </button>
      )}
      {open && (
        <div className="fixed z-50 inset-0 md:inset-auto md:right-6 md:bottom-6 md:w-[420px] md:h-[min(640px,calc(100dvh-6rem))] flex flex-col bg-white dark:bg-slate-950 md:rounded-2xl md:border border-slate-200 dark:border-slate-800 shadow-2xl">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <Sparkles className="h-4 w-4 text-teal-600" />
            <p className="font-bold flex-1">AI Tutor</p>
            <Link
              href={`/tutor${ctx.classId ? `?class=${ctx.classId}${ctx.kcId ? `&topic=${ctx.kcId}` : ""}` : ""}`}
              onClick={() => setOpen(false)}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900"
              aria-label="Open full page"
              title="Open full page"
            >
              <Maximize2 className="h-4 w-4" />
            </Link>
            <button type="button" onClick={() => setOpen(false)} className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="Close tutor">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0 pb-[env(safe-area-inset-bottom)]">
            <TutorChat key={`${ctx.classId}:${ctx.kcId}`} initialClassId={ctx.classId} initialKcId={ctx.kcId} compact />
          </div>
        </div>
      )}
    </>
  );
}
