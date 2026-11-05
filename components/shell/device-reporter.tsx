"use client";

import { useEffect } from "react";
import { classifyDevice } from "@/lib/device/classify";
import { installedBuild } from "@/lib/native/app-update";

const KEY = "sunroot:deviceReported";

/** Tells the server, at most once a day, what kind of device this is (phone/tablet/computer, app or website). Renders nothing. */
export function DeviceReporter() {
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (window.localStorage.getItem(KEY) === today) return;
    } catch {}
    (async () => {
      const build = await installedBuild();
      const nav = window.navigator as Navigator & { standalone?: boolean };
      const info = classifyDevice(nav.userAgent, {
        isNativeApp: build !== null,
        standalone: window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true,
        maxTouchPoints: nav.maxTouchPoints,
        screenWidth: Math.min(window.screen.width, window.screen.height),
      });
      const res = await fetch("/api/device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...info, ...(build !== null ? { appBuild: build } : {}) }),
      }).catch(() => null);
      if (res?.ok) {
        try {
          window.localStorage.setItem(KEY, today);
        } catch {}
      }
    })();
  }, []);
  return null;
}
