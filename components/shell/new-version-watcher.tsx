"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { isNewBuild, shouldApplyNow, VERSION_POLL_MS } from "@/lib/recover/new-version";

const MINE = process.env.NEXT_PUBLIC_BUILD_ID || "dev";

/**
 * When the site is updated while a page (or the Android app) is open, the page is out of date. This notices, shows one calm line
 * with a Refresh button, and refreshes by itself the next time the person changes page, never while they are typing.
 * It sits in the page flow (like the other banners), so it can never cover anything.
 */
export function NewVersionWatcher() {
  const [pending, setPending] = useState(false);
  const pathname = usePathname();
  const lastPath = useRef(pathname);

  useEffect(() => {
    if (MINE === "dev") return;
    let stop = false;
    const check = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const j = (await r.json()) as { data?: { build?: string } };
        if (!stop && isNewBuild(MINE, j?.data?.build)) setPending(true);
      } catch {
        /* offline: try again later */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const t = window.setInterval(() => void check(), VERSION_POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // changing page is the natural moment: reload onto the page the person was going to
  useEffect(() => {
    const navigated = lastPath.current !== pathname;
    lastPath.current = pathname;
    const typing = !!document.activeElement?.matches?.("input, textarea, select, [contenteditable='true']") || document.documentElement.dataset.keyboard === "open";
    if (shouldApplyNow({ pending, navigated, typing })) window.location.assign(window.location.href);
  }, [pathname, pending]);

  if (!pending) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-brand-500/30 bg-card/95 p-3 text-xs shadow-sm" role="status" aria-live="polite">
      <span className="min-w-0 font-semibold text-foreground">Sunroot was just updated. Refresh to get the newest version.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 font-semibold text-white hover:bg-brand-700 active:scale-95 touch-manipulation"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Refresh
      </button>
    </div>
  );
}
