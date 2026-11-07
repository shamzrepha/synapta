"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Sparkles, Sun, Moon } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useTheme } from "@/components/providers/theme-provider";

/** The landing page's top-right buttons: Theme switcher, "Open Sunroot" for signed in, "Log in" and "Start free" for guests. */
export function LandingButtons() {
  const { firebaseUser, isLoading } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex items-center gap-2">
      {/* 1-Click Theme Switcher */}
      <button
        type="button"
        onClick={toggleTheme}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-card/60 text-foreground transition-all hover:border-teal-500/40 hover:bg-muted active:scale-95 shadow-xs"
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark" ? (
          <Sun className="h-4 w-4 text-amber-400 transition-transform hover:rotate-45" />
        ) : (
          <Moon className="h-4 w-4 text-teal-600 transition-transform hover:-rotate-12" />
        )}
      </button>

      {!isLoading && firebaseUser ? (
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-500 via-amber-500 to-amber-600 px-4 py-2 text-sm font-bold text-slate-950 shadow-sm transition-all hover:scale-[1.02] hover:shadow-[0_8px_20px_-6px_rgba(245,158,11,0.5)] active:scale-95"
        >
          <Sparkles className="h-4 w-4" /> Open App <ArrowRight className="h-4 w-4" />
        </Link>
      ) : (
        <>
          <Link
            href="/login"
            className="rounded-full px-3.5 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/60"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-all hover:scale-[1.02] hover:shadow-[0_8px_20px_-6px_rgba(20,184,166,0.5)] active:scale-95"
          >
            Start free <ArrowRight className="h-4 w-4" />
          </Link>
        </>
      )}
    </div>
  );
}
