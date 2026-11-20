"use client";

import React, { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useUserStore } from "@/lib/store/use-user-store";

const EVENT = "sunroot:tour";
const key = (uid: string) => `sunroot.tour.v1.${uid}`;

/** Replays the tour (Settings, "Show me around"). */
export function startTour() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

const STEPS = [
  { sel: '[data-tour="add"]', title: "Add your material", body: "Upload notes, a PDF, a photo of homework, or ask the tutor. Everything starts here." },
  { sel: '[data-tour="jump"]', title: "Search or jump anywhere", body: "Type a word to find a class, a tool or a person. Suggestions show up before you type." },
  { sel: "[data-tour-nav]", title: "Your four places", body: "Home, My classes, Study and Community. Tap All features in your account menu to see everything." },
];

function visible(sel: string): HTMLElement | null {
  const els = Array.from(document.querySelectorAll<HTMLElement>(sel));
  return els.find((e) => e.offsetParent !== null || getComputedStyle(e).position === "fixed") ?? null;
}

/** A skippable three-step "Where things are" tour. Shown once per account on this device; no library. */
export function WhereThingsAre() {
  const { user } = useUserStore();
  const uid = user?.uid;
  const [step, setStep] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!uid) return;
    let seen = true;
    try {
      seen = localStorage.getItem(key(uid)) === "1";
    } catch {
      seen = true; // storage blocked: do not nag on every page
    }
    const t = seen ? undefined : setTimeout(() => setStep(0), 1200);
    const onStart = () => setStep(0);
    window.addEventListener(EVENT, onStart);
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener(EVENT, onStart);
    };
  }, [uid]);

  const finish = useCallback(() => {
    setStep(null);
    try {
      if (uid) localStorage.setItem(key(uid), "1");
    } catch {
      /* ignore */
    }
  }, [uid]);

  useLayoutEffect(() => {
    if (step === null) return;
    const measure = () => setRect(visible(STEPS[step].sel)?.getBoundingClientRect() ?? null);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [step]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, finish]);

  if (step === null) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  const below = rect ? rect.top < window.innerHeight / 2 : false;
  const style: React.CSSProperties = rect
    ? { left: Math.max(12, Math.min(rect.left, window.innerWidth - 300)), ...(below ? { top: rect.bottom + 12 } : { bottom: window.innerHeight - rect.top + 12 }) }
    : { left: 12, bottom: 96 };

  return (
    <div className="fixed inset-0 z-[95]" role="dialog" aria-label="Where things are">
      {rect && <div className="pointer-events-none fixed rounded-xl ring-4 ring-brand-500" style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }} />}
      <div className="fixed w-[min(18rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-card p-4 shadow-2xl" style={style}>
        <p className="text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">Where things are · {step + 1} of {STEPS.length}</p>
        <p className="mt-1 font-semibold">{s.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" onClick={finish} className="min-h-[44px] rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted">Skip</button>
          <button
            type="button"
            autoFocus
            onClick={() => (last ? finish() : setStep(step + 1))}
            className="min-h-[44px] rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 dark:bg-brand-500"
          >
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
