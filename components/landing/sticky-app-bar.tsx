"use client";

import React, { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

/** On a phone, a slim bar at the bottom offers the Android app once the visitor has scrolled past the top. It can be closed for the visit. */
export function StickyAppBar({ version }: { version?: string }) {
  const [show, setShow] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem("sr_appbar") === "1";
    } catch {
      /* private mode: it just shows again */
    }
    if (dismissed || !/android/i.test(navigator.userAgent || "")) return;
    const on = () => setShow(window.scrollY > 420);
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  if (!show || closed) return null;
  const close = () => {
    setClosed(true);
    try { sessionStorage.setItem("sr_appbar", "1"); } catch { /* ignore */ }
  };
  return (
    <div className="fixed inset-x-3 bottom-3 z-40 flex items-center gap-3 rounded-xl border border-border bg-background/95 p-2.5 shadow-elevated backdrop-blur md:hidden" role="region" aria-label="Get the Sunroot app">
      <img src="/logo-mark.svg" alt="" width={36} height={36} className="h-9 w-9 shrink-0" />
      <p className="min-w-0 flex-1 text-sm font-medium leading-tight">Sunroot for Android{version ? <span className="block text-xs font-normal text-muted-foreground">Version {version}</span> : null}</p>
      <a href="/download/android" download className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md bg-brand-600 px-4 text-sm font-semibold text-white dark:bg-brand-500 dark:text-slate-950"><Download className="h-4 w-4" aria-hidden="true" /> Get</a>
      <button type="button" onClick={close} aria-label="Close" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
    </div>
  );
}
