"use client";

import { useEffect } from "react";
import { getItem, themeVariables, THEME_SHADES } from "@/lib/shop/catalog";

// own key: "sunroot-theme" holds the light/dark choice (components/providers/theme-provider.tsx), so the two must not share it
const STORAGE_KEY = "sunroot-shop-theme";
export const THEME_EVENT = "sunroot:theme";

function apply(themeId: string | null | undefined) {
  const root = document.documentElement;
  // Always clear first so unequipping restores the default teal
  for (const shade of THEME_SHADES) root.style.removeProperty(`--color-teal-${shade}`);
  for (const v of ["--primary", "--accent", "--ring"]) root.style.removeProperty(v);
  const vars = themeVariables(themeId ? getItem(themeId) : undefined);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}

/**
 * Relationship to UI accents: shop themes recolour the TEAL scale (Sprout's wardrobe, success/reward-adjacent tints),
 * while the student's UI accent (Settings > Colour theme, app/accents.css) recolours the BRAND scale. They are independent
 * variables, so buying or equipping a shop theme never changes the interface accent and vice versa.
 */
/** Applies the equipped accent theme by overriding the teal scale CSS variables. Renders nothing. */
export function ThemeApplier() {
  useEffect(() => {
    let cached: string | null = null;
    try {
      cached = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
    if (cached) apply(cached);

    let cancelled = false;
    fetch("/api/shop")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json?.ok) return;
        const id: string | null = json.data?.equipped?.theme || null;
        apply(id);
        try {
          if (id) localStorage.setItem(STORAGE_KEY, id);
          else localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
      })
      .catch(() => null);

    const onChange = (e: Event) => {
      const id = (e as CustomEvent<string | null>).detail ?? null;
      apply(id);
      try {
        if (id) localStorage.setItem(STORAGE_KEY, id);
        else localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener(THEME_EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(THEME_EVENT, onChange);
    };
  }, []);
  return null;
}
