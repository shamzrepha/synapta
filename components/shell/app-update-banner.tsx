"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Download, X, CheckCircle2, RotateCw, Sparkles, AlertCircle, ShieldAlert, ExternalLink } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { installedBuild, nativeUpdater, parseLatest, shouldRecheck, updateKind, type LatestApp, type UpdateKind } from "@/lib/native/app-update";

const DISMISS_KEY = "sunroot:updateDismissed";
const CHECKED_KEY = "sunroot:updateChecked";
/** Settings ("Check for updates") asks the banner to check right now, ignoring the six-hour wait and any "later". */
export const UPDATE_CHECK_EVENT = "sunroot:check-update";

type UpdateStatus = "idle" | "downloading" | "complete" | "permission" | "error";

const readNum = (key: string): number | null => {
  try {
    const v = Number(window.localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
};

/**
 * The app's update manager. It looks for a newer release when the app opens, when it comes back to the screen and every few hours
 * while it stays open, and shows what is new. A newer version is offered ("later" is fine) unless the release marks the installed
 * build as too old, in which case the update is required. The download happens inside the app, with progress, through the native
 * updater when the Android project has one, otherwise through the page, with the browser as a safe fallback.
 *
 * Android does not let an app install itself silently outside Google Play: the system installer always asks the person to tap
 * Install. So this never claims an update is applied; the new version is in place once it is installed and the app is reopened.
 * (Changes to the website itself need none of this: the app loads the live site, so they arrive the moment they are deployed.)
 */
export function AppUpdateBanner() {
  const { toast } = useToast();
  const [latest, setLatest] = useState<LatestApp | null>(null);
  const [kind, setKind] = useState<UpdateKind>("none");
  const [status, setStatus] = useState<UpdateStatus>("idle");
  // null while the size is unknown: the bar then just keeps moving
  const [progress, setProgress] = useState<number | null>(0);
  const [bytesInfo, setBytesInfo] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const blobRef = useRef<Blob | null>(null);
  const urlRef = useRef<string | null>(null);
  const busy = useRef(false);

  // let go of the downloaded file when the banner goes away
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const check = useCallback(
    async (force: boolean) => {
      if (busy.current) return;
      const mine = await installedBuild();
      if (mine === null) {
        if (force) toast({ title: "Updates are for the Android app", description: "On the website you always have the latest version." });
        return;
      }
      const now = Date.now();
      if (!force && !shouldRecheck(readNum(CHECKED_KEY), now)) return;
      try {
        window.localStorage.setItem(CHECKED_KEY, String(now));
      } catch {}
      const raw = await fetch("/app-version.json", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      const l = parseLatest(raw);
      if (!l) {
        if (force) toast({ title: "Couldn't check right now", description: "Check your connection and try again.", variant: "amber" });
        return;
      }
      const k = updateKind(mine, l);
      if (k === "none") {
        setLatest(null);
        setKind("none");
        if (force) toast({ title: "You're up to date", description: `Sunroot ${l.versionName} is the latest version.`, variant: "success" });
        return;
      }
      if (k === "optional" && !force && readNum(DISMISS_KEY) === l.versionCode) return;
      setLatest(l);
      setKind(k);
      setStatus("idle");
      if (force) toast({ title: "A new version is ready", description: l.notes || `Version ${l.versionName}`, variant: "success" });
    },
    [toast],
  );

  useEffect(() => {
    // the check is async (it awaits the app version and the network before setting anything)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void check(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check(false);
    };
    const onForce = () => void check(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(UPDATE_CHECK_EVENT, onForce);
    // an app left open for days still notices a release; the six-hour rule inside check() keeps this cheap
    const timer = window.setInterval(() => void check(false), 15 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(UPDATE_CHECK_EVENT, onForce);
      window.clearInterval(timer);
    };
  }, [check]);

  const openInBrowser = () => {
    if (!latest) return;
    try {
      const win = window as unknown as { Capacitor?: { Plugins?: { App?: { openUrl?: (o: { url: string }) => Promise<unknown> } } } };
      if (win.Capacitor?.Plugins?.App?.openUrl) {
        void win.Capacitor.Plugins.App.openUrl({ url: latest.url });
        return;
      }
    } catch {}
    window.open(latest.url, "_blank", "noopener");
  };

  const openInstaller = () => {
    const blob = blobRef.current;
    if (!blob) return openInBrowser();
    // hand the file to Android's installer through the download
    try {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = urlRef.current;
      a.download = `sunroot-${latest?.versionName || "update"}.apk`;
      document.body.appendChild(a);
      a.click();
      window.setTimeout(() => {
        try {
          document.body.removeChild(a);
        } catch {}
      }, 1000);
    } catch (e) {
      console.error("Trigger blob install error:", e);
    }
  };

  const startUpdate = async () => {
    if (!latest || busy.current) return;
    busy.current = true;
    setStatus("downloading");
    setProgress(0);
    setBytesInfo("Connecting to update server...");
    setErrorMsg("");
    try {
      const native = nativeUpdater();
      if (native) {
        // the Android project downloads it (with progress) and opens the system installer
        let sub: { remove: () => void } | undefined;
        try {
          sub = await native.addListener?.("progress", (e) => {
            if (typeof e.percent === "number") setProgress(Math.min(99, Math.round(e.percent)));
            else setProgress(null);
            if (e.total) setBytesInfo(`${((e.received ?? 0) / 1048576).toFixed(1)} / ${(e.total / 1048576).toFixed(1)} MB`);
            if (e.error) setErrorMsg(e.error);
          });
        } catch {}
        const res = await native.downloadAndInstall({ url: latest.url, versionCode: latest.versionCode });
        sub?.remove();
        if (res?.needsPermission) {
          setStatus("permission");
          return;
        }
        setProgress(100);
        setStatus("complete");
        setBytesInfo("Download finished");
        return;
      }

      const res = await fetch(latest.url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const total = Number(res.headers.get("content-length")) || 0;
      if (!total) setProgress(null);
      const reader = res.body?.getReader();
      if (!reader) {
        blobRef.current = await res.blob();
      } else {
        let received = 0;
        const chunks: Uint8Array[] = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            received += value.length;
            const mb = (n: number) => (n / 1048576).toFixed(1);
            if (total) {
              setProgress(Math.min(99, Math.round((received / total) * 100)));
              setBytesInfo(`${mb(received)} / ${mb(total)} MB`);
            } else {
              setBytesInfo(`${mb(received)} MB`);
            }
          }
        }
        blobRef.current = new Blob(chunks as BlobPart[], { type: "application/vnd.android.package-archive" });
      }
      setProgress(100);
      setStatus("complete");
      setBytesInfo("Download finished");
      openInstaller();
    } catch (e) {
      console.error("In-app update failed:", e);
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Download failed");
    } finally {
      busy.current = false;
    }
  };

  const later = () => {
    if (!latest || kind === "required") return;
    try {
      window.localStorage.setItem(DISMISS_KEY, String(latest.versionCode));
    } catch {}
    setLatest(null);
  };

  if (!latest || kind === "none") return null;
  const required = kind === "required";

  return (
    <div
      className={`mb-3 rounded-2xl border p-3.5 shadow-md backdrop-blur-sm ${required ? "border-amber-500/50 bg-amber-50/90 dark:bg-amber-950/40" : "border-brand-500/30 bg-card/95"}`}
      role="status"
      aria-live="polite"
    >
      {status === "idle" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${required ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" : "bg-brand-500/15 text-brand-600 dark:text-brand-400"}`}>
              {required ? <ShieldAlert className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-foreground">{required ? "Please update Sunroot" : "A new version of Sunroot is ready"} (v{latest.versionName})</div>
              <div className="text-[11px] text-muted-foreground">
                {required ? "This older version can no longer work properly. " : ""}
                {latest.notes || "New features and fixes."}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void startUpdate()}
              className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-brand-700 active:scale-95 touch-manipulation"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Update</span>
            </button>
            {!required && (
              <button type="button" aria-label="Remind me later" onClick={later} className="cursor-pointer rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {status === "downloading" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <RotateCw className="h-3.5 w-3.5 animate-spin text-brand-600" />
              <span>Downloading v{latest.versionName}...</span>
            </div>
            <span className="font-bold text-brand-600 dark:text-brand-400">{progress === null ? "" : `${progress}%`}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className={`h-full rounded-full bg-gradient-to-r from-brand-600 to-emerald-500 transition-all duration-150 ease-out ${progress === null ? "w-1/3 animate-pulse" : ""}`}
              style={progress === null ? undefined : { width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>Downloading inside the app</span>
            <span className="font-mono">{bytesInfo}</span>
          </div>
        </div>
      )}

      {status === "permission" && (
        <div className="space-y-2.5">
          <div className="flex items-start gap-2.5 text-xs">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span className="text-foreground">Android needs your OK to install Sunroot updates. Turn on &ldquo;Allow from this source&rdquo; for Sunroot in the screen that opened, come back and press Update again.</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void startUpdate()} className="cursor-pointer rounded-xl bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white">
              Update again
            </button>
          </div>
        </div>
      )}

      {status === "complete" && (
        <div className="space-y-2.5">
          <div className="flex items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-foreground">Downloaded v{latest.versionName}</div>
              <div className="text-[11px] text-muted-foreground">
                Tap <b>Install</b> when Android asks, then reopen Sunroot. If nothing opened, press the button below.
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openInstaller}
              className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95 touch-manipulation"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Open installer</span>
            </button>
            <button type="button" onClick={openInBrowser} className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted">
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Use the browser instead</span>
            </button>
            {!required && (
              <button type="button" onClick={later} className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted">
                Later
              </button>
            )}
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="space-y-2.5">
          <div className="flex items-start gap-2.5 text-xs text-rose-600 dark:text-rose-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Update interrupted ({errorMsg || "network error"}).</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void startUpdate()} className="cursor-pointer rounded-lg bg-brand-600 px-3 py-1 text-xs font-semibold text-white">
              Retry
            </button>
            <button type="button" onClick={openInBrowser} className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted">
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Download in the browser</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
