"use client";

import React, { useEffect, useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

/** Registers the service worker once and shows a small banner while the device is offline. */
export function OfflineManager() {
  const online = useOnline();

  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js").catch(() => null);
  }, []);

  if (online) return null;
  return (
    <div
      role="status"
      className="fixed left-1/2 top-2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900/90 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg dark:bg-slate-100/90 dark:text-slate-900"
    >
      <WifiOff className="h-3.5 w-3.5" /> You&apos;re offline. Downloaded items still work.
    </div>
  );
}
