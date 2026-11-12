"use client";

import React, { useEffect, useState } from "react";
import { Minimize2, Play } from "lucide-react";
import { useCoarsePointer } from "@/lib/ui/use-coarse-pointer";

/** The "Tap to enter the lab" cover that sits over a live stage on touch screens, so the page keeps scrolling under the finger. */
export function EnterLabVeil({ onEnter, label = "Tap to enter the lab" }: { onEnter: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onEnter}
      aria-label={label}
      className="absolute inset-0 z-20 grid place-items-center bg-black/30 text-white backdrop-blur-[1px] touch-pan-y"
    >
      <span className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold shadow-elevated">
        <Play className="h-4 w-4 fill-current" /> {label}
      </span>
    </button>
  );
}

/**
 * Wraps any interactive lab (sliders, canvases) so that on a phone it shows as a still preview you can scroll past.
 * Tapping it opens the lab full screen; "Exit lab" returns to the page. On a computer it is shown as normal.
 */
export function TapToEnter({ children, title = "Lab" }: { children: React.ReactNode; title?: string }) {
  const touch = useCoarsePointer();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!touch) return <>{children}</>;

  return (
    <div
      className={
        open
          ? "fixed inset-0 z-[100] bg-background overflow-y-auto overscroll-contain pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
          : "relative max-h-[22rem] overflow-hidden rounded-xl border border-border"
      }
    >
      {open && (
        <div className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-background/95 backdrop-blur px-3 py-2">
          <p className="min-w-0 truncate text-sm font-semibold">{title}</p>
          <button type="button" onClick={() => setOpen(false)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white">
            <Minimize2 className="h-4 w-4" /> Exit lab
          </button>
        </div>
      )}
      <div className={open ? "p-3" : "pointer-events-none select-none"} aria-hidden={!open}>
        {children}
      </div>
      {!open && <EnterLabVeil onEnter={() => setOpen(true)} />}
    </div>
  );
}
