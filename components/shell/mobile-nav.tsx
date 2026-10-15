"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, GraduationCap, Newspaper, Swords, LayoutGrid, X } from "lucide-react";
import { useUserStore } from "@/lib/store/use-user-store";
import { useRealtime } from "@/components/providers/realtime-provider";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isActivePath } from "./nav-items";

const PRIMARY = [
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "Classes", href: "/classes/manage", icon: GraduationCap },
  { label: "Community", href: "/feed", icon: Newspaper },
  { label: "Challenges", href: "/challenges", icon: Swords },
];

/** Phone navigation: four primary tabs plus a "More" sheet with everything else. */
export function MobileNav() {
  const pathname = usePathname();
  const { user } = useUserStore();
  const { unreadCount } = useRealtime();
  const [open, setOpen] = useState(false);
  const role = user?.role || "student";
  const more = NAV_ITEMS.filter((i) => i.roles.includes(role) && !PRIMARY.some((p) => p.href === i.href));
  const moreActive = more.some((i) => isActivePath(pathname, i.href));

  return (
    <>
      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="absolute bottom-0 inset-x-0 rounded-t-3xl bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 p-4 pb-[calc(5rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold">More</p>
              <button onClick={() => setOpen(false)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {more.map((item) => {
                const Icon = item.icon;
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-3 min-h-[76px] text-center",
                      active ? "border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300" : "border-slate-200 dark:border-slate-800"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-[11px] font-semibold leading-tight">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-slate-200/80 bg-white/95 backdrop-blur-lg dark:border-slate-800/80 dark:bg-slate-950/95 pb-[env(safe-area-inset-bottom)]"
        aria-label="Mobile navigation"
      >
        <div className="grid grid-cols-5 h-16">
          {PRIMARY.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
                  active ? "text-teal-600 dark:text-teal-400 font-semibold" : "text-slate-500 dark:text-slate-400"
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={cn(
              "relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
              open || moreActive ? "text-teal-600 dark:text-teal-400 font-semibold" : "text-slate-500 dark:text-slate-400"
            )}
          >
            <LayoutGrid className="h-5 w-5" />
            More
            {unreadCount > 0 && <span className="absolute top-2 right-[30%] h-2 w-2 rounded-full bg-rose-500" />}
          </button>
        </div>
      </nav>
    </>
  );
}
