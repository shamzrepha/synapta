"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Compass,
  Users,
  MessageSquare,
  Activity,
  User,
} from "lucide-react";
import { useUserStore } from "@/lib/store/use-user-store";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const pathname = usePathname();
  const { user } = useUserStore();
  const userRole = user?.role || "student";

  const items = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Explore", href: "/explore", icon: Compass },
    { label: "Friends", href: "/friends", icon: MessageSquare },
    { label: "Lounge", href: "/lounge", icon: Users },
    ...(userRole === "teacher" || userRole === "admin"
      ? [{ label: "Heatmap", href: "/classes/heatmap", icon: Activity }]
      : [{ label: "Profile", href: "/profile", icon: User }]),
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/80 bg-white/95 px-2 py-1 backdrop-blur-lg dark:border-slate-800/80 dark:bg-slate-950/95"
      aria-label="Mobile Navigation"
    >
      <div className="flex items-center justify-around h-14">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full min-h-[44px] min-w-[44px] text-xs font-medium transition-colors select-none",
                isActive
                  ? "text-teal-600 dark:text-teal-400 font-semibold"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 mb-0.5",
                  isActive
                    ? "text-teal-600 dark:text-teal-400"
                    : "text-slate-400 dark:text-slate-500"
                )}
              />
              <span className="text-[10px] leading-tight truncate max-w-[56px] text-center">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
