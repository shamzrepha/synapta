"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Compass,
  BookOpen,
  Users,
  User,
  GraduationCap,
  Activity,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  BrainCircuit,
} from "lucide-react";
import { useUserStore } from "@/lib/store/use-user-store";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Array<"student" | "teacher" | "admin">;
}

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["student", "teacher", "admin"],
  },
  {
    label: "Explore",
    href: "/explore",
    icon: Compass,
    roles: ["student", "teacher", "admin"],
  },
  {
    label: "Notebook",
    href: "/notebook",
    icon: BookOpen,
    roles: ["student", "teacher", "admin"],
  },
  {
    label: "Peer Lounge",
    href: "/lounge",
    icon: Users,
    roles: ["student", "teacher", "admin"],
  },
  {
    label: "Manage Classes",
    href: "/classes/manage",
    icon: GraduationCap,
    roles: ["teacher", "admin"],
  },
  {
    label: "Class Heatmap",
    href: "/classes/heatmap",
    icon: Activity,
    roles: ["teacher", "admin"],
  },
  {
    label: "Admin Console",
    href: "/admin",
    icon: ShieldCheck,
    roles: ["admin"],
  },
  {
    label: "Profile",
    href: "/profile",
    icon: User,
    roles: ["student", "teacher", "admin"],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, isSidebarCollapsed, toggleSidebar } = useUserStore();
  const userRole = user?.role || "student";

  const visibleItems = navItems.filter((item) => item.roles.includes(userRole));

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-r border-slate-200/80 bg-white dark:border-slate-800/80 dark:bg-slate-950 transition-all duration-300 z-30 select-none",
        isSidebarCollapsed ? "w-20" : "w-64"
      )}
      aria-label="Main Navigation"
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-slate-200/80 dark:border-slate-800/80">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 overflow-hidden focus-visible:ring-2 focus-visible:ring-teal-500 rounded-lg p-1"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950 font-bold shadow-sm">
            <BrainCircuit className="h-6 w-6" />
          </div>
          {!isSidebarCollapsed && (
            <div className="flex flex-col">
              <span className="font-bold text-lg tracking-tight text-slate-900 dark:text-slate-100">
                Synapta
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-teal-600 dark:text-teal-400">
                Cognitive Twin
              </span>
            </div>
          )}
        </Link>
        <button
          onClick={toggleSidebar}
          aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden md:flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          {isSidebarCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-1.5 p-3 overflow-y-auto">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors group relative",
                isActive
                  ? "bg-teal-500/10 text-teal-700 font-semibold dark:bg-teal-500/20 dark:text-teal-300"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100"
              )}
              title={isSidebarCollapsed ? item.label : undefined}
            >
              <Icon
                className={cn(
                  "h-5 w-5 shrink-0 transition-colors",
                  isActive
                    ? "text-teal-600 dark:text-teal-400"
                    : "text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300"
                )}
              />
              {!isSidebarCollapsed && (
                <span className="truncate">{item.label}</span>
              )}
              {isActive && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-teal-500 rounded-l-full" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User summary card in sidebar footer */}
      {!isSidebarCollapsed && user && (
        <div className="p-3 border-t border-slate-200/80 dark:border-slate-800/80">
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between">
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                {user.displayName || user.email}
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge
                  variant={
                    user.role === "admin"
                      ? "destructive"
                      : user.role === "teacher"
                      ? "amber"
                      : "default"
                  }
                  className="capitalize text-[10px] py-0 px-1.5"
                >
                  {user.role}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
