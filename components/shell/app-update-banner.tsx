"use client";

import React, { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { installedBuild, needsUpdate, parseLatest, type LatestApp } from "@/lib/native/app-update";

const DISMISS_KEY = "sunroot:updateDismissed";

/** Inside the Android app only: a one-tap "Update" when a newer APK is published. Shows nothing on the website. */
export function AppUpdateBanner() {
  const [latest, setLatest] = useState<LatestApp | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const mine = await installedBuild();
      if (mine === null) return;
      const raw = await fetch("/app-version.json", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      const l = parseLatest(raw);
      if (!alive || !needsUpdate(mine, l) || !l) return;
      try {
        if (window.localStorage.getItem(DISMISS_KEY) === String(l.versionCode)) return;
      } catch {}
      setLatest(l);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!latest) return null;
  return (
    <div className="mb-3 flex items-center gap-2 rounded-xl border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-sm text-brand-900 dark:text-brand-200" role="status">
      <Download className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">A new version of Sunroot ({latest.versionName}) is ready.</span>
      <a href={latest.url} className="shrink-0 rounded-lg bg-brand-600 px-3 py-1 text-xs font-semibold text-white">
        Update
      </a>
      <button
        type="button"
        aria-label="Hide"
        onClick={() => {
          try {
            window.localStorage.setItem(DISMISS_KEY, String(latest.versionCode));
          } catch {}
          setLatest(null);
        }}
        className="shrink-0 rounded-lg p-1"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
