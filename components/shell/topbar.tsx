"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Flame, Sun, Moon, LogOut, MessageSquare, User, Bell, BrainCircuit } from "lucide-react";
import { useUserStore } from "@/lib/store/use-user-store";
import { useTheme } from "@/components/providers/theme-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { levelFromXp } from "@/lib/game/levels";
import { formatNumber } from "@/lib/utils";

export function Topbar() {
  const { user } = useUserStore();
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const level = levelFromXp(user?.xp || 0);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-30 flex h-14 md:h-16 w-full items-center justify-between gap-2 border-b border-slate-200/80 bg-white/85 px-3 md:px-4 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-950/85">
      {/* Left: brand on phones (sidebar is hidden there), search from sm up */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Link href="/dashboard" className="md:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white" aria-label="Home">
          <BrainCircuit className="h-5 w-5" />
        </Link>
        <form
          className="relative hidden sm:block w-full max-w-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) router.push(`/explore?q=${encodeURIComponent(query.trim())}`);
          }}
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search classes and topics…"
            className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-400"
          />
        </form>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1.5 md:gap-2.5 shrink-0">
        {user && (
          <Link
            href="/profile"
            className="flex items-center gap-2 rounded-full bg-teal-500/10 pl-1 pr-2.5 py-1 text-xs font-semibold text-teal-800 dark:text-teal-300 border border-teal-500/20 hover:bg-teal-500/15"
            title={`Level ${level.level} ${level.title} · ${formatNumber(level.xp)} XP · ${formatNumber(level.nextLevelXp - level.xp)} XP to next level`}
          >
            <span className="relative h-7 w-7">
              <svg viewBox="0 0 36 36" className="h-7 w-7 -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="4" />
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${Math.round(level.progress * 94)} 94`}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-extrabold">{level.level}</span>
            </span>
            <span className="hidden sm:inline">{formatNumber(level.xp)} XP</span>
          </Link>
        )}

        {user && (
          <div
            className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400 border border-amber-500/20"
            title={`${user.streakDays} day study streak`}
          >
            <Flame className="h-4 w-4 text-amber-500" />
            <span>{user.streakDays}</span>
          </div>
        )}

        <Link
          href="/friends"
          title="Friends & messages"
          aria-label="Friends and messages"
          className="hidden sm:flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:text-teal-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-teal-400"
        >
          <MessageSquare className="h-4 w-4" />
        </Link>

        {user && <NotificationBell />}

        {user && (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Account menu"
              aria-expanded={menuOpen}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-700 text-white font-semibold text-xs border border-teal-500/30 shadow-sm overflow-hidden"
            >
              {user.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.photoURL} alt="" className="h-full w-full object-cover" />
              ) : (
                (user.displayName || user.email || "U").charAt(0).toUpperCase()
              )}
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-11 w-56 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl py-2 z-50">
                <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 mb-1">
                  <p className="text-sm font-semibold truncate">{user.displayName || user.email}</p>
                  <p className="text-xs text-slate-500">
                    Level {level.level} · {level.title}
                  </p>
                </div>
                <Link href="/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-900">
                  <User className="h-4 w-4" /> Profile & badges
                </Link>
                <Link href="/notifications" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-900">
                  <Bell className="h-4 w-4" /> Notifications
                </Link>
                <Link href="/friends" onClick={() => setMenuOpen(false)} className="sm:hidden flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-900">
                  <MessageSquare className="h-4 w-4" /> Friends & messages
                </Link>
                <button type="button" onClick={toggleTheme} className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-900">
                  {theme === "dark" ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
                  {theme === "dark" ? "Light mode" : "Dark mode"}
                </button>
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
