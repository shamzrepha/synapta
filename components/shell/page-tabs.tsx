"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface PageTab {
  label: string;
  href: string;
  /** other paths that count as this tab */
  match?: string[];
}

/** Tabs along the top of a hub, so related pages feel like one place instead of separate menu items. */
export function PageTabs({ tabs, label }: { tabs: PageTab[]; label: string }) {
  const pathname = usePathname();
  const active = (t: PageTab) => [t.href, ...(t.match || [])].some((p) => pathname === p || pathname.startsWith(p + "/"));
  return (
    <nav aria-label={label} className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-1">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={active(t) ? "page" : undefined}
          className={cn("shrink-0 rounded-xl px-4 py-2 text-sm font-semibold whitespace-nowrap", active(t) ? "bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 shadow-sm" : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-100")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export const CLASS_TABS: PageTab[] = [
  { label: "My classes", href: "/classes/manage" },
  { label: "Find a class", href: "/explore" },
];

export const COMMUNITY_TABS: PageTab[] = [
  { label: "Overview", href: "/community" },
  { label: "Feed", href: "/feed" },
  { label: "Study rooms", href: "/lounge" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Challenges", href: "/challenges" },
  { label: "Messages", href: "/messages" },
];
