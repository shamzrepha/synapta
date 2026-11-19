"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X, ExternalLink, Megaphone, Bell } from "lucide-react";
import { Sprout, type BotPose } from "@/components/bot/sprout";
import { useRealtime } from "@/components/providers/realtime-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { playCuteVoice } from "@/lib/audio/sfx";
import { cn } from "@/lib/utils";

export interface HeadsUpItem {
  id: string;
  title: string;
  body: string;
  href?: string | null;
  sproutMood?: "idle" | "wave" | "jump" | "dance" | "think" | "search";
  level?: "info" | "warning";
  timestamp?: number;
}

const SEEN_KEY = "sunroot:seen_notices";

function getSeenIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function markSeenId(id: string) {
  try {
    const seen = getSeenIds();
    seen.add(id);
    // Keep max 50
    const arr = Array.from(seen).slice(-50);
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

/**
 * Android/WhatsApp/Duolingo-style Heads-Up Notification Banner.
 * Drops down smoothly from the top navbar with Sprout's animated mascot expression + message
 * whenever a notice or broadcast is dispatched.
 */
export function HeadsUpNotice() {
  const router = useRouter();
  const { firebaseUser } = useAuth();
  const { signalVersion, lastTopic } = useRealtime();
  const [activeNotice, setActiveNotice] = useState<HeadsUpItem | null>(null);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);
  const lastSignalRef = useRef(signalVersion);

  const dismiss = useCallback(() => {
    setExiting(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setActiveNotice((curr) => {
        if (curr) markSeenId(curr.id);
        return null;
      });
      setExiting(false);
    }, 280);
  }, []);

  const trigger = useCallback(
    (item: HeadsUpItem) => {
      const seen = getSeenIds();
      if (seen.has(item.id)) return;

      window.clearTimeout(timerRef.current);
      setActiveNotice(item);
      setExiting(false);

      // Play soft notification sound
      try {
        playCuteVoice("happy");
      } catch {
        // audio optional
      }

      // Auto dismiss after 9s
      timerRef.current = window.setTimeout(() => {
        dismiss();
      }, 9000);
    },
    [dismiss]
  );

  // 1. Listen for site-wide admin notice from /api/site
  const checkSiteNotice = useCallback(async () => {
    try {
      const res = await fetch("/api/site");
      const j = await res.json();
      if (j?.ok && j.data?.notice?.text) {
        const text = j.data.notice.text.trim();
        const noticeId = "site_notice_" + text.slice(0, 32).replace(/\s+/g, "_");
        trigger({
          id: noticeId,
          title: "Announcement",
          body: text,
          sproutMood: j.data.notice.level === "warning" ? "think" : "jump",
          level: j.data.notice.level,
        });
      }
    } catch {
      // offline
    }
  }, [trigger]);

  // 2. Listen for personalized or targeted broadcast notifications from /api/notifications
  const checkLatestBroadcast = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const res = await fetch("/api/notifications?limit=3");
      const j = await res.json();
      if (j?.ok && Array.isArray(j.data?.notifications)) {
        const unread = j.data.notifications.find(
          (n: { id: string; type: string; read: boolean }) => !n.read && n.type === "broadcast"
        );
        if (unread) {
          trigger({
            id: unread.id,
            title: unread.title || "Campus Notice",
            body: unread.body || "",
            href: unread.href || "/notifications",
            sproutMood: unread.sproutMood || "wave",
          });
        }
      }
    } catch {
      // offline
    }
  }, [firebaseUser, trigger]);

  // Initial check on mount
  useEffect(() => {
    const t = window.setTimeout(() => {
      checkSiteNotice();
      checkLatestBroadcast();
    }, 1200);
    return () => window.clearTimeout(t);
  }, [checkSiteNotice, checkLatestBroadcast]);

  // Check whenever realtime signals fire
  useEffect(() => {
    if (signalVersion > lastSignalRef.current) {
      lastSignalRef.current = signalVersion;
      if (lastTopic === "notifications" || lastTopic === "broadcast" || !lastTopic) {
        checkLatestBroadcast();
        checkSiteNotice();
      }
    }
  }, [signalVersion, lastTopic, checkLatestBroadcast, checkSiteNotice]);

  // Listen to manual dispatch events
  useEffect(() => {
    const onCustom = (e: Event) => {
      const custom = e as CustomEvent<HeadsUpItem>;
      if (custom.detail) trigger(custom.detail);
    };
    window.addEventListener("sunroot:show-notice", onCustom);
    return () => window.removeEventListener("sunroot:show-notice", onCustom);
  }, [trigger]);

  if (!activeNotice) return null;

  const pose: BotPose = (activeNotice.sproutMood as BotPose) || "wave";

  const handleAction = () => {
    if (activeNotice.href) {
      router.push(activeNotice.href);
      dismiss();
    }
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        "fixed top-[calc(0.75rem+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[100] w-[min(26rem,calc(100vw-1.25rem))] pointer-events-auto",
        "transition-all duration-300 ease-out",
        exiting
          ? "opacity-0 -translate-y-8 scale-95"
          : "opacity-100 translate-y-0 scale-100 animate-in slide-in-from-top-6"
      )}
    >
      <div
        onClick={handleAction}
        className={cn(
          "group relative flex items-start gap-3.5 rounded-2xl border p-3.5 shadow-2xl backdrop-blur-xl transition-all select-none",
          activeNotice.href ? "cursor-pointer hover:shadow-brand-500/20" : "",
          activeNotice.level === "warning"
            ? "border-amber-500/40 bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-slate-100"
            : "border-brand-500/40 bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-slate-100 ring-1 ring-brand-500/20"
        )}
      >
        {/* Animated Sprout Expression Avatar */}
        <div className="relative h-12 w-12 shrink-0 rounded-2xl bg-gradient-to-br from-brand-500/15 to-emerald-500/20 border border-brand-500/30 p-1 flex items-center justify-center overflow-hidden shadow-inner">
          <Sprout pose={pose} className="h-full w-full" />
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
        </div>

        {/* Notice Message Details */}
        <div className="flex-1 min-w-0 pr-6">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-brand-600 dark:text-brand-400 flex items-center gap-1">
              <Megaphone className="h-3 w-3" /> SunRoot Alert
            </span>
            <span className="text-[10px] text-slate-400">• Just now</span>
          </div>
          <h4 className="text-sm font-bold leading-snug line-clamp-1">{activeNotice.title}</h4>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2 leading-relaxed">
            {activeNotice.body}
          </p>
          {activeNotice.href && (
            <div className="flex items-center gap-1 text-[11px] font-semibold text-brand-600 dark:text-brand-400 mt-1.5 group-hover:underline">
              <span>View details</span>
              <ExternalLink className="h-2.5 w-2.5" />
            </div>
          )}
        </div>

        {/* Dismiss Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
