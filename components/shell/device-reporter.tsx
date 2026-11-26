"use client";

import { useEffect } from "react";
import { classifyDevice } from "@/lib/device/classify";
import { installedBuild } from "@/lib/native/app-update";
import { registerCurrentDevice, fetchDeviceSessions } from "@/lib/auth/device-client";
import { useAuth } from "@/components/providers/auth-provider";
import { useToast } from "@/components/ui/toast";
import { EVICTION_MESSAGE } from "@/lib/auth/concurrent-sessions";

const KEY = "sunroot:deviceReported";

/** Tells the server what kind of device this is and registers concurrent login sessions. Renders nothing. */
export function DeviceReporter() {
  const { signOut } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1. Register device session for concurrent-login tracking
      await registerCurrentDevice();

      // 2. Check if current device was evicted by another sign-in
      const sessionStatus = await fetchDeviceSessions();
      if (!cancelled && sessionStatus.isCurrentRevoked) {
        toast({
          title: "Signed out",
          description: sessionStatus.revokedReason || EVICTION_MESSAGE,
          variant: "destructive",
        });
        await signOut();
        return;
      }

      // 3. Daily device hardware/browser stats
      const today = new Date().toISOString().slice(0, 10);
      try {
        if (window.localStorage.getItem(KEY) === today) return;
      } catch {}

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

    return () => {
      cancelled = true;
    };
  }, [signOut, toast]);

  return null;
}
