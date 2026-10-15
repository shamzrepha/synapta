"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, BrainCircuit } from "lucide-react";
import { useUserStore } from "@/lib/store/use-user-store";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isActivePath } from "./nav-items";

const GROUP_LABEL: Record<string, string> = { learn: "Learn", social: "Together", account: "You" };

/**
 * Desktop/tablet navigation. Tablets (md) get an icon rail automatically; laptops (lg+) get the full
 * sidebar unless the user collapses it. Phones use the bottom bar instead.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { user, isSidebarCollapsed, toggleSidebar } = useUserStore();
  const role = user?.role || "student";
  const items = NAV_ITEMS.filter((i) => i.roles.includes(role));
  // Labels show only on lg+ and only when not collapsed
  const label = isSidebarCollapsed ? "hidden" : "hidden lg:inline";

  return (
    <aside
      className={cn(
        "hidden md:flex sticky top-0 h-screen flex-col border-r border-slate-200/80 bg-white dark:border-slate-800/80 dark:bg-slate-950 transition-all duration-300 z-30 select-none shrink-0",
        isSidebarCollapsed ? "w-[72px]" : "w-[72px] lg:w-60"
      )}
      aria-label="Main navigation"
    >
      <div className="flex h-16 items-center justify-between px-3 border-b border-slate-200/80 dark:border-slate-800/80">
        <Link href="/dashboard" className="flex items-center gap-2.5 overflow-hidden rounded-lg p-1">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950 shadow-sm">
            <BrainCircuit className="h-6 w-6" />
          </div>
          <span className={cn("font-bold text-lg tracking-tight", label)}>Sunroot</span>
        </Link>
        <button
          onClick={toggleSidebar}
          aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn("h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800", isSidebarCollapsed ? "hidden" : "hidden lg:flex")}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 p-2.5 overflow-y-auto space-y-4">
        {(["learn", "social", "account"] as const).map((group) => (
          <div key={group} className="space-y-1">
            <p className={cn("px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400", label)}>{GROUP_LABEL[group]}</p>
            {items
              .filter((i) => i.group === group)
              .map((item) => {
                const Icon = item.icon;
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors relative justify-center",
                      !isSidebarCollapsed && "lg:justify-start",
                      active
                        ? "bg-teal-500/10 text-teal-700 font-semibold dark:bg-teal-500/20 dark:text-teal-300"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100"
                    )}
                  >
                    <Icon className={cn("h-5 w-5 shrink-0", active ? "text-teal-600 dark:text-teal-400" : "text-slate-400")} />
                    <span className={cn("truncate", label)}>{item.label}</span>
                    {active && <span className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-teal-500 rounded-l-full" />}
                  </Link>
                );
              })}
          </div>
        ))}
      </nav>

      {isSidebarCollapsed && (
        <button
          onClick={toggleSidebar}
          aria-label="Expand sidebar"
          className="hidden lg:flex m-3 h-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </aside>
  );
}
