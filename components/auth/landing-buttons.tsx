"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Sun, Moon } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useTheme } from "@/components/providers/theme-provider";

/** The landing page's top-right controls: light/dark switch, then "Open Sunroot" for signed-in people or "Log in" and "Start free" for guests. */
export function LandingButtons() {
  const { firebaseUser, isLoading } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggleTheme}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      {!isLoading && firebaseUser ? (
        <Link href="/dashboard" className="inline-flex h-9 items-center gap-2 rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600">
          Open Sunroot <ArrowRight className="h-4 w-4" />
        </Link>
      ) : (
        <>
          <Link href="/login" className="hidden h-9 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex">
            Log in
          </Link>
          <Link href="/signup" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600">
            Start free
          </Link>
        </>
      )}
    </div>
  );
}
