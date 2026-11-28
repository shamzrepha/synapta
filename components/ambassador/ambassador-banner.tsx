"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

const KEY = "sunroot:ambassador-banner-dismissed";

/** A small, closable call for students to become ambassadors. It comes back after a week if closed. */
export function AmbassadorBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const at = Number(window.localStorage.getItem(KEY) || 0);
        setShow(!at || Date.now() - at > 7 * 86_400_000);
      } catch {
        setShow(true);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  const close = () => {
    try { window.localStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ }
    setShow(false);
  };
  return (
    <aside className="relative flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 pr-12" aria-label="Become an ambassador">
      <div className="min-w-0">
        <p className="font-semibold">Earn by sharing Sunroot with your coursemates</p>
        <p className="text-sm text-muted-foreground">Become an ambassador: get a link, and 20% of every first payment goes to your bank account.</p>
      </div>
      <Link href="/ambassador/dashboard" className="inline-flex min-h-[44px] items-center rounded-md bg-brand-500 px-4 text-sm font-semibold text-slate-950 hover:bg-brand-400">Get my link</Link>
      <button type="button" onClick={close} aria-label="Close" className="absolute right-2 top-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
    </aside>
  );
}
