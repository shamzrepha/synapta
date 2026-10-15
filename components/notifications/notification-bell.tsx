"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { useRealtime } from "@/components/providers/realtime-provider";
import { NotificationList, type NotificationItem } from "./notification-list";
import { cn } from "@/lib/utils";

async function fetchNotifications(): Promise<NotificationItem[] | null> {
  try {
    const res = await fetch("/api/notifications?limit=15");
    const data = await res.json();
    return data.ok ? data.data.notifications : null;
  } catch {
    return null;
  }
}

export function NotificationBell() {
  const { unreadCount, signalVersion } = useRealtime();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  // Optimistically hide the badge after "mark all read" until the server's next signal arrives
  const [clearedAtVersion, setClearedAtVersion] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const list = await fetchNotifications();
    if (list) setItems(list);
  }, []);

  // New signal from the server: refresh the list if it's open
  useEffect(() => {
    if (!open) return;
    fetchNotifications().then((list) => {
      if (list) setItems(list);
    });
  }, [signalVersion, open]);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setClearedAtVersion(signalVersion);
    await fetch("/api/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => null);
  };

  const badge = clearedAtVersion === signalVersion ? 0 : Math.max(0, unreadCount);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) refresh();
        }}
        aria-label={`Notifications${badge ? `, ${badge} unread` : ""}`}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
      >
        <Bell className={cn("h-4 w-4", badge > 0 && "text-teal-600 dark:text-teal-400")} />
        {badge > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-slate-950 animate-in zoom-in">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed sm:absolute inset-x-2 sm:inset-x-auto top-16 sm:top-11 sm:right-0 sm:w-96 max-h-[75vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <p className="font-bold text-sm">Notifications</p>
            <button type="button" onClick={markAllRead} className="text-xs font-semibold text-teal-600 dark:text-teal-400 flex items-center gap-1">
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          </div>
          <div className="overflow-y-auto flex-1">
            <NotificationList items={items} onNavigate={() => setOpen(false)} />
          </div>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block text-center text-xs font-semibold py-2.5 border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
          >
            See all
          </Link>
        </div>
      )}
    </div>
  );
}
