/** UI accent palettes (the CSS lives in app/accents.css; "blue" is the default brand scale and has no override). */
export const ACCENT_IDS = ["blue", "rose", "lavender", "emerald", "sunset", "ocean", "slate"] as const;
export type AccentId = (typeof ACCENT_IDS)[number];
export const DEFAULT_ACCENT: AccentId = "blue";

export function isAccentId(v: unknown): v is AccentId {
  return typeof v === "string" && (ACCENT_IDS as readonly string[]).includes(v);
}

/** Picker data: swatches are brand-300 / 600 / 800 of each palette (checked against the CSS in accents.test.ts). */
export const ACCENTS: { id: AccentId; label: string; swatch: [string, string, string] }[] = [
  { id: "blue", label: "Sunroot blue", swatch: ["#9DB4FF", "#3552E0", "#243792"] },
  { id: "rose", label: "Rose", swatch: ["#fda4af", "#e11d48", "#9f1239"] },
  { id: "lavender", label: "Lavender", swatch: ["#c4b5fd", "#7c3aed", "#5b21b6"] },
  { id: "emerald", label: "Emerald", swatch: ["#6ee7b7", "#047857", "#064e3b"] },
  { id: "sunset", label: "Sunset", swatch: ["#fdba74", "#c2410c", "#7c2d12"] },
  { id: "ocean", label: "Ocean", swatch: ["#7dd3fc", "#0369a1", "#0c4a6e"] },
  { id: "slate", label: "Slate", swatch: ["#cbd5e1", "#475569", "#1e293b"] },
];

/** Inline pre-paint script body: applies the saved accent before first paint (keep in sync with PREFS_KEY). */
export const ACCENT_BOOT_SCRIPT =
  "(function(){try{var p=JSON.parse(localStorage.getItem('sunroot.prefs')||'null');var a=p&&p.accent;if(a&&a!=='blue'&&/^[a-z]+$/.test(a))document.documentElement.setAttribute('data-accent',a)}catch(e){}})()";
