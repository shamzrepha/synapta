"use client";

import { BrandMark } from "@/components/landing/brand-mark";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ArrowLeft, Search, Flame, Sun, Moon, LogOut, MessageSquare, User, Bell, BrainCircuit, Bookmark, Globe } from "lucide-react";
import { useUserStore } from "@/lib/store/use-user-store";
import { useTheme } from "@/components/providers/theme-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { useRealtime } from "@/components/providers/realtime-provider";
import { levelFromXp } from "@/lib/game/levels";
import { formatNumber } from "@/lib/utils";
import { ROOT_PATHS } from "./nav-items";
import { useT } from "@/components/settings/use-t";
import { LanguageList, LanguageMenu } from "@/components/settings/language-picker";
import { PlanChip } from "@/components/billing/plan-chip";

export function Topbar() {
  const t = useT();
  const { user } = useUserStore();
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useAuth();
  const { dmUnread } = useRealtime();
  const router = useRouter();
  const pathname = usePathname();
  const canGoBack = !ROOT_PATHS.includes(pathname);
  const goBack = () => {
    // go to the previous page when there is one in this tab, otherwise up one level
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(pathname.split("/").slice(0, -1).join("/") || "/dashboard");
  };
  const [menuOpen, setMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
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
    <header className="sticky top-0 z-[45] flex h-14 md:h-16 w-full items-center justify-between gap-2 border-b border-slate-200/80 bg-white px-3 md:px-4  dark:border-slate-800/80 dark:bg-slate-950">
      {/* Left: brand on phones (sidebar is hidden there), search from sm up */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {canGoBack && (
          <button type="button" onClick={goBack} className="flex h-9 shrink-0 items-center gap-1 rounded-xl border border-slate-200 px-2.5 text-sm font-semibold hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-900" aria-label="Go back">
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">{t("Back")}</span>
          </button>
        )}
        <Link href="/dashboard" className={`${canGoBack ? "hidden" : "md:hidden flex"} h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-500 text-slate-950 shadow-sm`} aria-label="Home">
          <BrandMark className="h-5 w-5" />
        </Link>
        <Link href="/search" className="sm:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800" aria-label="Search">
          <Search className="h-4 w-4" />
        </Link>
        <form
          className="relative hidden sm:block w-full max-w-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) router.push(`/search?q=${encodeURIComponent(query.trim())}`);
          }}
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search people, classes, topics, #tags…")}
            className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-400"
          />
        </form>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1.5 md:gap-2.5 shrink-0 min-w-0">
        {user && <PlanChip />}

        {user && (
          <Link
            href="/profile"
            className="hidden sm:flex items-center gap-2 rounded-full bg-teal-500/10 pl-1 pr-2.5 py-1 text-xs font-semibold text-teal-800 dark:text-teal-300 border border-teal-500/20 hover:bg-teal-500/15"
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
          <Link
            href="/streak"
            className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
            title={`${user.streakDays} day study streak — click to view streak & freezes`}
          >
            <Flame className="h-4 w-4 text-amber-500" />
            <span>{user.streakDays}</span>
          </Link>
        )}

        <Link
          href="/messages"
          title="Messages"
          aria-label={`Messages${dmUnread ? `, ${dmUnread} unread` : ""}`}
          className="relative hidden sm:flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:text-teal-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-teal-400"
        >
          <MessageSquare className="h-4 w-4" />
          {dmUnread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-teal-600 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-slate-950">
              {dmUnread > 99 ? "99+" : dmUnread}
            </span>
          )}
        </Link>

        {user && (
          <div className="hidden sm:block">
            <LanguageMenu />
          </div>
        )}

        {user && <NotificationBell />}

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-card/70 text-foreground hover:border-teal-500/40 hover:bg-muted transition-all  shadow-xs"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4 text-amber-400 transition-transform duration-300 " />
          ) : (
            <Moon className="h-4 w-4 text-teal-600 transition-transform duration-300 " />
          )}
        </button>

        {user && (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Account menu"
              aria-expanded={menuOpen}
              className="relative flex h-9 w-9 items-center justify-center rounded-full bg-teal-700 text-white font-semibold text-xs border border-teal-500/30 shadow-sm"
            >
              {user.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.photoURL} alt="" className="h-full w-full rounded-full object-cover" />
              ) : (
                (user.displayName || user.email || "U").charAt(0).toUpperCase()
              )}
              {dmUnread > 0 && <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-teal-500 ring-2 ring-white dark:ring-slate-950 sm:hidden" />}
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-11 w-[min(14rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl py-2 z-50">
                <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 mb-1">
                  <p className="text-sm font-semibold truncate">{user.displayName || user.email}</p>
                  <p className="text-xs text-slate-500">
                    Level {level.level} · {level.title}
                  </p>
                </div>
                <p className="sm:hidden px-4 pb-1 text-xs font-semibold text-teal-700 dark:text-teal-300">{formatNumber(level.xp)} XP</p>
                <Link href="/messages" onClick={() => setMenuOpen(false)} className="sm:hidden flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-900">
                  <MessageSquare className="h-4 w-4" /> Messages
                  {dmUnread > 0 && <span className="ml-auto rounded-full bg-teal-600 px-1.5 text-[10px] font-bold text-white">{dmUnread > 99 ? "99+" : dmUnread}</span>}
                </Link>
                <Link href="/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-900">
                  <User className="h-4 w-4" /> Profile & badges
                </Link>
                <Link href="/notifications" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-900">
                  <Bell className="h-4 w-4" /> Notifications
                </Link>
                <Link href="/friends" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-900">
                  <MessageSquare className="h-4 w-4" /> Friends
                </Link>
                <Link href="/saved" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-900">
                  <Bookmark className="h-4 w-4" /> Saved
                </Link>
                <button type="button" onClick={() => setLangOpen((v) => !v)} aria-expanded={langOpen} className="sm:hidden w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-900">
                  <Globe className="h-4 w-4" /> Language
                </button>
                {langOpen && (
                  <div className="sm:hidden mx-2 mb-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 p-1 dark:border-slate-800">
                    <LanguageList onPick={() => { setLangOpen(false); setMenuOpen(false); }} />
                  </div>
                )}
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
