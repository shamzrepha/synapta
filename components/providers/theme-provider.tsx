"use client";

import React, { createContext, useContext, useEffect, useSyncExternalStore, useCallback } from "react";
import { usePrefs } from "@/components/settings/use-prefs";
import { applyColorMode } from "@/lib/settings/mode";
import type { ColorMode } from "@/lib/settings/accents";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** "system" follows the device; light/dark pin it. Saved locally at once and synced to the account (prefs.mode). */
  mode: ColorMode;
  setMode: (mode: ColorMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    media.removeEventListener("change", callback);
  };
}

function getSnapshot(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = (localStorage.getItem("sunroot-theme") || localStorage.getItem("synapta-theme")) as Theme | null;
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** The explicit choice stored on this device (older installs have one without prefs.mode), or "system". */
function getModeSnapshot(): ColorMode {
  const stored = localStorage.getItem("sunroot-theme") || localStorage.getItem("synapta-theme");
  return stored === "light" || stored === "dark" ? stored : "system";
}

function getServerSnapshot(): Theme {
  return "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const mode = useSyncExternalStore(subscribe, getModeSnapshot, () => "system" as ColorMode);
  const [, updatePrefs] = usePrefs();

  // keep the page in step with the choice (also when the device's light/dark setting changes and no choice was saved)
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const setMode = useCallback(
    (m: ColorMode) => {
      applyColorMode(m);
      updatePrefs({ mode: m });
    },
    [updatePrefs]
  );
  const setTheme = useCallback((t: Theme) => setMode(t), [setMode]);

  const toggleTheme = useCallback(() => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
