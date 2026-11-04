"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { UPGRADE_EVENT } from "@/lib/billing/upgrade-event";

/**
 * Appears whenever something the learner tried is over their plan's allowance or isn't in it. Mounted once in the app
 * shell; it listens for the event the API client raises, so no screen has to handle limit errors itself.
 */
export function UpgradeDialog() {
  const [message, setMessage] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const on = (e: Event) => setMessage(String((e as CustomEvent<{ message?: string }>).detail?.message || "This needs a bigger plan."));
    window.addEventListener(UPGRADE_EVENT, on);
    return () => window.removeEventListener(UPGRADE_EVENT, on);
  }, []);
  useEffect(() => {
    if (!message) return;
    closeRef.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMessage(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [message]);

  if (!message) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true" aria-labelledby="upgrade-title" onClick={() => setMessage(null)}>
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 p-5 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600"><Sparkles className="h-5 w-5" /></span>
          <div className="flex-1 min-w-0">
            <h2 id="upgrade-title" className="font-extrabold text-lg leading-tight">Time to upgrade</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{message}</p>
          </div>
          <button ref={closeRef} type="button" onClick={() => setMessage(null)} aria-label="Close" className="p-1 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-xs text-slate-500">Pay in naira by card, bank transfer, USSD or mobile money. Your plan switches on as soon as the payment is confirmed.</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setMessage(null)} className="h-10 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold">Not now</button>
          <Link href="/plans" onClick={() => setMessage(null)} className="h-10 rounded-xl bg-[#F28C28] text-[#12241C] text-sm font-bold flex items-center justify-center hover:bg-[#F59E45]">See plans</Link>
        </div>
      </div>
    </div>
  );
}
