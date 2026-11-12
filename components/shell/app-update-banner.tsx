"use client";

import React, { useEffect, useState } from "react";
import { Download, X, ExternalLink } from "lucide-react";
import { installedBuild, needsUpdate, parseLatest, type LatestApp } from "@/lib/native/app-update";

const DISMISS_KEY = "sunroot:updateDismissed";

/** Inside the Android app only: a one-tap "Update" when a newer APK is published. Shows nothing on the website. */
export function AppUpdateBanner() {
  const [latest, setLatest] = useState<LatestApp | null>(null);
  const [downloading, setDownloading] = useState(false);

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

  const handleUpdate = (e: React.MouseEvent | React.TouchEvent) => {
    if (!latest) return;
    e.preventDefault();
    e.stopPropagation();
    setDownloading(true);

    const url = latest.url;

    // 1. Try Capacitor Browser / App plugin if available
    try {
      const win = typeof window !== "undefined" ? (window as unknown as {
        Capacitor?: {
          Plugins?: {
            Browser?: { open?: (opts: { url: string }) => Promise<void> };
            App?: { openUrl?: (opts: { url: string }) => Promise<{ completed?: boolean }> };
          };
        };
      }) : undefined;

      if (win?.Capacitor?.Plugins?.Browser?.open) {
        void win.Capacitor.Plugins.Browser.open({ url });
        return;
      }
      if (win?.Capacitor?.Plugins?.App?.openUrl) {
        void win.Capacitor.Plugins.App.openUrl({ url });
        return;
      }
    } catch {}

    // 2. Open via _system (Android WebView intent to system browser / download manager)
    try {
      const sysWin = window.open(url, "_system");
      if (sysWin) return;
    } catch {}

    // 3. Open via _blank
    try {
      const blankWin = window.open(url, "_blank");
      if (blankWin) return;
    } catch {}

    // 4. Fallback: window.location
    try {
      window.location.href = url;
    } catch {}
  };

  if (!latest) return null;
  return (
    <div className="mb-3 rounded-xl border border-brand-500/30 bg-brand-500/10 p-3 text-sm text-brand-900 dark:text-brand-200" role="status">
      <div className="flex items-center gap-2">
        <Download className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 font-medium">A new version of Sunroot ({latest.versionName}) is ready.</span>
        <button
          type="button"
          onClick={handleUpdate}
          onTouchEnd={handleUpdate}
          className="shrink-0 cursor-pointer rounded-lg bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 active:scale-95 transition-all touch-manipulation"
        >
          {downloading ? "Opening..." : "Update"}
        </button>
        <button
          type="button"
          aria-label="Hide"
          onClick={() => {
            try {
              window.localStorage.setItem(DISMISS_KEY, String(latest.versionCode));
            } catch {}
            setLatest(null);
          }}
          className="shrink-0 cursor-pointer rounded-lg p-1 text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {downloading && (
        <div className="mt-2 text-xs text-brand-800 dark:text-brand-300 flex items-center gap-1.5">
          <span>Opening APK download. If it didn&apos;t open,</span>
          <a
            href={latest.url}
            target="_system"
            rel="noopener noreferrer"
            download={`sunroot-${latest.versionName}.apk`}
            className="font-bold underline inline-flex items-center gap-0.5 hover:text-brand-900 dark:hover:text-brand-100"
          >
            tap here to download <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
}
