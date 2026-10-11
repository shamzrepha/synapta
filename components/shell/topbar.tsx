"use client";

import React from "react";
import Link from "next/link";
import { Search, Flame, Zap, Sun, Moon, LogOut, MessageSquare } from "lucide-react";
import { useUserStore } from "@/lib/store/use-user-store";
import { useTheme } from "@/components/providers/theme-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { formatNumber } from "@/lib/utils";

export function Topbar() {
  const { user } = useUserStore();
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useAuth();

  return (
    <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-slate-200/80 bg-white/80 px-4 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-950/80">
      {/* Search Bar */}
      <div className="flex items-center gap-2 max-w-md w-full">
        <div className="relative w-full max-w-xs md:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            placeholder="Search classes, concepts, labs..."
            className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs md:text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-400"
          />
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Friends & Direct Messages Quick Link */}
        <Link
          href="/friends"
          title="Friends & Messages"
          className="flex h-9 items-center gap-1.5 px-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:text-teal-600 hover:border-teal-500/30 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-teal-400 transition-colors text-xs font-semibold shadow-sm"
        >
          <MessageSquare className="h-4 w-4 text-teal-600 dark:text-teal-400" />
          <span className="hidden sm:inline">Friends</span>
        </Link>

        {/* Streak Chip */}
        {user && (
          <div
            className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400 border border-amber-500/20"
            title={`${user.streakDays} day study streak`}
          >
            <Flame className="h-4 w-4 text-amber-500 animate-pulse" />
            <span>{user.streakDays}d</span>
          </div>
        )}

        {/* XP Chip */}
        {user && (
          <div
            className="flex items-center gap-1.5 rounded-full bg-teal-500/10 px-2.5 py-1 text-xs font-semibold text-teal-700 dark:text-teal-400 border border-teal-500/20"
            title={`${formatNumber(user.xp)} Experience Points`}
          >
            <Zap className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            <span>{formatNumber(user.xp)} XP</span>
          </div>
        )}

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          aria-label="Toggle color theme"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4 text-amber-400" />
          ) : (
            <Moon className="h-4 w-4 text-slate-600" />
          )}
        </button>

        {/* User Avatar & Sign Out */}
        {user && (
          <div className="flex items-center gap-2 pl-1">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-700 text-white font-semibold text-xs border border-teal-500/30 shadow-sm"
              title={`${user.displayName || user.email} (${user.role})`}
            >
              {user.displayName
                ? user.displayName.charAt(0).toUpperCase()
                : user.email?.charAt(0).toUpperCase() || "U"}
            </div>
            <button
              onClick={() => signOut()}
              title="Sign Out"
              aria-label="Sign out of account"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-rose-400 dark:hover:bg-rose-950/40 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
