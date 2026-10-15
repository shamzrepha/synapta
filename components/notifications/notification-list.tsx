"use client";

import React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  icon: string | null;
  read: boolean;
  createdAt: string | null;
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationList({
  items,
  onNavigate,
  emptyText = "You're all caught up.",
}: {
  items: NotificationItem[];
  onNavigate?: () => void;
  emptyText?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-slate-500 space-y-2">
        <Bell className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-700" />
        <p>{emptyText}</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {items.map((n) => {
        const content = (
          <div className={cn("flex gap-3 px-4 py-3 transition-colors", !n.read && "bg-teal-500/5")}>
            <span className="h-9 w-9 shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-lg">
              {n.icon || "🔔"}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm leading-snug", !n.read ? "font-semibold" : "text-slate-700 dark:text-slate-300")}>{n.title}</p>
              {n.body && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>}
              <p className="text-[11px] text-slate-400 mt-1">{timeAgo(n.createdAt)}</p>
            </div>
            {!n.read && <span className="h-2 w-2 rounded-full bg-teal-500 mt-2 shrink-0" aria-label="unread" />}
          </div>
        );
        return (
          <li key={n.id}>
            {n.href ? (
              <Link href={n.href} onClick={onNavigate} className="block hover:bg-slate-50 dark:hover:bg-slate-900/60">
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}
