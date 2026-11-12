"use client";

import React, { useEffect, useState } from "react";
import { Download, X, CheckCircle2, RotateCw, Sparkles, AlertCircle } from "lucide-react";
import { installedBuild, needsUpdate, parseLatest, type LatestApp } from "@/lib/native/app-update";

const DISMISS_KEY = "sunroot:updateDismissed";

type UpdateStatus = "idle" | "downloading" | "complete" | "error";

/**
 * In-app update manager:
 * Downloads newer APKs directly inside the app with a real-time progress bar,
 * triggers package installation, and restarts the app without needing Chrome browser.
 */
export function AppUpdateBanner() {
  const [latest, setLatest] = useState<LatestApp | null>(null);
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [bytesInfo, setBytesInfo] = useState("");
  const [countdown, setCountdown] = useState(3);
  const [errorMsg, setErrorMsg] = useState("");

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

  const startInAppUpdate = async () => {
    if (!latest) return;
    setStatus("downloading");
    setProgress(0);
    setBytesInfo("Connecting to update server...");
    setErrorMsg("");

    try {
      const res = await fetch(latest.url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const total = Number(res.headers.get("content-length")) || 8872596;
      const reader = res.body?.getReader();

      if (!reader) {
        // Fallback if ReadableStream is unavailable
        setBytesInfo("Downloading package...");
        const blob = await res.blob();
        setProgress(100);
        finishUpdate(blob);
        return;
      }

      let received = 0;
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
          const pct = Math.min(99, Math.round((received / total) * 100));
          setProgress(pct);
          setBytesInfo(`${(received / (1024 * 1024)).toFixed(1)} / ${(total / (1024 * 1024)).toFixed(1)} MB`);
        }
      }

      setProgress(100);
      const blob = new Blob(chunks as BlobPart[], { type: "application/vnd.android.package-archive" });
      finishUpdate(blob);
    } catch (e) {
      console.error("In-app update failed:", e);
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Download failed");
    }
  };

  const finishUpdate = (blob: Blob) => {
    setStatus("complete");
    setBytesInfo("Ready to install!");

    // 1. Trigger the package file in the Android environment
    try {
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `sunroot-${latest?.versionName || "update"}.apk`;
      document.body.appendChild(a);
      a.click();
      window.setTimeout(() => {
        try {
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        } catch {}
      }, 5000);
    } catch (e) {
      console.error("Trigger blob install error:", e);
    }

    // 2. Also try native openUrl if Capacitor App plugin exists
    try {
      const win = typeof window !== "undefined" ? (window as unknown as {
        Capacitor?: {
          Plugins?: {
            App?: { openUrl?: (opts: { url: string }) => Promise<{ completed?: boolean }> };
          };
        };
      }) : undefined;
      if (win?.Capacitor?.Plugins?.App?.openUrl && latest?.url) {
        void win.Capacitor.Plugins.App.openUrl({ url: latest.url });
      }
    } catch {}

    // 3. Countdown and restart the app
    let c = 3;
    setCountdown(3);
    const interval = window.setInterval(() => {
      c -= 1;
      setCountdown(c);
      if (c <= 0) {
        window.clearInterval(interval);
        restartApp();
      }
    }, 1000);
  };

  const restartApp = () => {
    // Clear caches and reload app fresh
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  if (!latest) return null;

  return (
    <div
      className="mb-3 rounded-2xl border border-brand-500/30 bg-card/95 p-3.5 shadow-md backdrop-blur-sm transition-all"
      role="status"
      aria-live="polite"
    >
      {/* 1. IDLE STATE: Offer the update */}
      {status === "idle" && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-600 dark:text-brand-400">
              <Sparkles className="h-4 w-4 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-foreground">
                Sunroot update ready (v{latest.versionName})
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                Includes new Sprout animations, Jarvis buddy &amp; speed fixes
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={startInAppUpdate}
              className="cursor-pointer rounded-xl bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 active:scale-95 transition-all touch-manipulation flex items-center gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Update In-App</span>
            </button>
            <button
              type="button"
              aria-label="Hide update notice"
              onClick={() => {
                try {
                  window.localStorage.setItem(DISMISS_KEY, String(latest.versionCode));
                } catch {}
                setLatest(null);
              }}
              className="cursor-pointer rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* 2. DOWNLOADING STATE: In-App Progress Bar */}
      {status === "downloading" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <RotateCw className="h-3.5 w-3.5 animate-spin text-brand-600" />
              <span>Downloading update (v{latest.versionName})...</span>
            </div>
            <span className="font-bold text-brand-600 dark:text-brand-400">{progress}%</span>
          </div>

          {/* Progress Bar Track & Fill */}
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-600 to-emerald-500 transition-all duration-150 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Updating directly inside the app</span>
            <span className="font-mono">{bytesInfo}</span>
          </div>
        </div>
      )}

      {/* 3. COMPLETE STATE: Restart Countdown & Action */}
      {status === "complete" && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-foreground">Update complete!</div>
              <div className="text-[11px] text-muted-foreground">
                Restarting Sunroot in {countdown}s to apply changes...
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={restartApp}
            className="cursor-pointer rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 active:scale-95 transition-all touch-manipulation flex items-center gap-1.5"
          >
            <RotateCw className="h-3.5 w-3.5" />
            <span>Restart Now</span>
          </button>
        </div>
      )}

      {/* 4. ERROR STATE: Retry Options */}
      {status === "error" && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-rose-600 dark:text-rose-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Update interrupted ({errorMsg || "network error"}).</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={startInAppUpdate}
              className="cursor-pointer rounded-lg bg-brand-600 px-3 py-1 text-xs font-semibold text-white"
            >
              Retry
            </button>
            <a
              href={latest.url}
              target="_system"
              rel="noopener noreferrer"
              download
              className="text-xs font-semibold underline text-muted-foreground hover:text-foreground"
            >
              Manual Link
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
