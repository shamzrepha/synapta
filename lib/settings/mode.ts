import type { ColorMode } from "./accents";

/** localStorage keys the pre-paint script in app/layout.tsx reads (light/dark only; absent means "follow the device"). */
const KEYS = ["sunroot-theme", "synapta-theme"];

/** Applies light / dark / system to the page and the local keys, and tells other hooks and tabs. Browser only. */
export function applyColorMode(m: ColorMode) {
  try {
    for (const k of KEYS) {
      if (m === "system") localStorage.removeItem(k);
      else localStorage.setItem(k, m);
    }
  } catch {
    /* storage blocked: lasts until reload */
  }
  const dark = m === "system" ? window.matchMedia("(prefers-color-scheme: dark)").matches : m === "dark";
  document.documentElement.classList.toggle("dark", dark);
  window.dispatchEvent(new Event("storage"));
}
