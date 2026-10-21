"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, X } from "lucide-react";
import { useUserStore } from "@/lib/store/use-user-store";
import { useRealtime } from "@/components/providers/realtime-provider";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isActivePath } from "./nav-items";

const PRIMARY = NAV_ITEMS.filter((i) => i.primary);

/** Phone navigation: four primary tabs plus a "More" sheet with everything else. */
export function MobileNav() {
  const pathname = usePathname();
  const { user } = useUserStore();
  const { unreadCount } = useRealtime();
  // the sheet belongs to the page it was opened on, so any navigation (link, Back, redirect) closes it
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const role = user?.role || "student";
  const sheetRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpenAt(null);
    moreButtonRef.current?.focus();
  }, []);

  // Keyboard: Escape closes, Tab stays inside the sheet, focus starts on the close button; page behind doesn't scroll
  useEffect(() => {
    if (!open) return;
    const sheet = sheetRef.current;
    const focusables = () => Array.from(sheet?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []);
    focusables()[0]?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "Tab") {
        const items = focusables();
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);
  const primary = PRIMARY.filter((i) => i.roles.includes(role));
  const more = NAV_ITEMS.filter((i) => i.roles.includes(role) && !i.primary);
  const moreActive = more.some((i) => isActivePath(pathname, i.href, i.match));

  return (
    <>
      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm" onClick={close}>
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="More places"
            className="absolute bottom-0 inset-x-0 rounded-t-3xl bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 p-4 pb-[calc(5rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold">More places</p>
              <button type="button" onClick={close} className="p-2.5 min-h-11 min-w-11 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {more.map((item) => {
                const Icon = item.icon;
                const active = isActivePath(pathname, item.href, item.match);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-3 min-h-[76px] text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500",
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
          {primary.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href, item.match);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500",
                  active ? "text-teal-600 dark:text-teal-400 font-semibold" : "text-slate-500 dark:text-slate-400"
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
          <button
            ref={moreButtonRef}
            type="button"
            onClick={() => setOpenAt(open ? null : pathname)}
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-label={unreadCount > 0 ? "More, you have new notifications" : "More"}
            className={cn(
              "relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500",
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
