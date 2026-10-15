"use client";

import React, { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { clientApp } from "@/lib/firebase/client";

const VAPID = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

async function getPushToken(): Promise<string> {
  const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
  if (!(await isSupported())) throw new Error("This browser doesn't support push notifications.");
  const app = clientApp();
  const opts = app.options;
  const qs = new URLSearchParams({
    apiKey: String(opts.apiKey || ""),
    projectId: String(opts.projectId || ""),
    messagingSenderId: String(opts.messagingSenderId || ""),
    appId: String(opts.appId || ""),
  });
  const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${qs}`);
  return getToken(getMessaging(app), { vapidKey: VAPID, serviceWorkerRegistration: registration });
}

/** Turns phone/desktop push notifications on or off for this browser. */
export function PushToggle() {
  const { toast } = useToast();
  const [state, setState] = useState<"unknown" | "on" | "off" | "denied" | "unsupported">("unknown");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) setState("unsupported");
      else if (Notification.permission === "denied") setState("denied");
      else setState(localStorage.getItem("synapta-push") === "on" && Notification.permission === "granted" ? "on" : "off");
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const token = await getPushToken();
      const r = await fetch("/api/me/push-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, enabled: true }) }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error?.message);
      try {
        localStorage.setItem("synapta-push", "on");
      } catch {}
      setState("on");
      toast({ title: "Push notifications on", description: "You'll get alerts even when Synapta is closed.", variant: "success" });
    } catch (e) {
      toast({ title: "Couldn't enable push", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const token = await getPushToken().catch(() => null);
      if (token) await fetch("/api/me/push-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, enabled: false }) });
      try {
        localStorage.setItem("synapta-push", "off");
      } catch {}
      setState("off");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span>
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <BellRing className="h-4 w-4 text-teal-600" /> Push notifications
        </span>
        <span className="block text-xs text-slate-500">
          {!VAPID
            ? "Not set up yet — an admin needs to add the Firebase web push key (NEXT_PUBLIC_FIREBASE_VAPID_KEY)."
            : state === "denied"
            ? "Blocked in your browser settings. Allow notifications for this site to turn them on."
            : state === "unsupported"
            ? "This browser doesn't support push. On iPhone, add Synapta to your Home Screen first."
            : "Get messages, mentions, session reminders and results on this device even when the app is closed."}
        </span>
      </span>
      {VAPID && state !== "unsupported" && state !== "denied" && (
        <Button size="sm" variant={state === "on" ? "outline" : "default"} onClick={state === "on" ? disable : enable} isLoading={busy}>
          {state === "on" ? "Turn off" : "Turn on"}
        </Button>
      )}
    </div>
  );
}
