import { hsl, contrast, rgbToHsl } from "./color";

/**
 * UI themes. Each theme tints the WHOLE interface: the brand (action) scale, the neutral ramp (--color-slate-*, which every
 * bg-slate-* / text-slate-* / border-slate-* utility reads), and the semantic tokens (--background, --card, --border, ...),
 * in both light and dark mode. The CSS lives in app/accents.css and is GENERATED from this file (`npm run gen:accents`);
 * lib/settings/accents.test.ts fails when the two drift apart and checks WCAG contrast for every theme and mode.
 * "blue" (Sunroot blue) is the default: its values are the base ones in app/globals.css, so it has no block in accents.css.
 * Rewards (gold/amber), success/danger and the mastery scale are separate tokens and never change with the theme.
 * Shop themes (components/shop/theme-applier.tsx) only recolour the teal scale, so they stay independent of this.
 */
export const ACCENT_GROUPS = ["Soft", "Bold", "Cool and neutral"] as const;
export type AccentGroup = (typeof ACCENT_GROUPS)[number];

/** Persisted values (prefs.accent). The ids rose, lavender, emerald, sunset, ocean and slate predate the redesign and are kept. */
export const ACCENT_IDS = [
  "blue", "rose", "lavender", "peach", "mint", "sky", "lilac",
  "hotpink", "purple", "crimson", "sunset", "gold", "emerald", "ocean", "forest",
  "slate", "midnight", "sand",
] as const;
export type AccentId = (typeof ACCENT_IDS)[number];
export const DEFAULT_ACCENT: AccentId = "blue";

export function isAccentId(v: unknown): v is AccentId {
  return typeof v === "string" && (ACCENT_IDS as readonly string[]).includes(v);
}

export type ColorMode = "light" | "dark" | "system";
export function isColorMode(v: unknown): v is ColorMode {
  return v === "light" || v === "dark" || v === "system";
}

export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Ramp = Record<(typeof SHADES)[number], string>;

interface ThemeSeed {
  id: Exclude<AccentId, "blue">;
  label: string;
  group: AccentGroup;
  /** hue (degrees) and saturation of the accent */
  hue: number;
  sat: number;
  /** surface tint: saturation of the light page / dark page, lightness of the light page / dark page */
  lightSat: number;
  darkSat: number;
  lightL: number;
  darkL: number;
  /** optional exact page backgrounds */
  lightBg?: string;
  darkBg?: string;
}

const SEEDS: ThemeSeed[] = [
  // Soft: pastel pages, gentle darks
  { id: "rose", label: "Blush Pink", group: "Soft", hue: 342, sat: 78, lightSat: 100, darkSat: 63, lightL: 98, darkL: 10, lightBg: "#FFF5F8", darkBg: "#2A0F1E" },
  { id: "lavender", label: "Lavender", group: "Soft", hue: 262, sat: 70, lightSat: 80, darkSat: 40, lightL: 97.5, darkL: 11 },
  { id: "peach", label: "Peach", group: "Soft", hue: 20, sat: 80, lightSat: 100, darkSat: 48, lightL: 97.5, darkL: 10 },
  { id: "mint", label: "Mint", group: "Soft", hue: 160, sat: 68, lightSat: 70, darkSat: 45, lightL: 96.5, darkL: 9 },
  { id: "sky", label: "Sky", group: "Soft", hue: 200, sat: 80, lightSat: 90, darkSat: 52, lightL: 97, darkL: 10 },
  { id: "lilac", label: "Lilac", group: "Soft", hue: 288, sat: 56, lightSat: 70, darkSat: 40, lightL: 97.5, darkL: 11 },
  // Bold: stronger tints
  { id: "hotpink", label: "Hot Pink", group: "Bold", hue: 328, sat: 85, lightSat: 90, darkSat: 66, lightL: 96, darkL: 9 },
  { id: "purple", label: "Royal Purple", group: "Bold", hue: 270, sat: 72, lightSat: 70, darkSat: 58, lightL: 96, darkL: 9 },
  { id: "crimson", label: "Crimson", group: "Bold", hue: 350, sat: 80, lightSat: 75, darkSat: 62, lightL: 96, darkL: 9 },
  { id: "sunset", label: "Sunset Orange", group: "Bold", hue: 24, sat: 88, lightSat: 90, darkSat: 62, lightL: 95.5, darkL: 9 },
  { id: "gold", label: "Gold", group: "Bold", hue: 42, sat: 90, lightSat: 90, darkSat: 58, lightL: 95.5, darkL: 9 },
  { id: "emerald", label: "Emerald", group: "Bold", hue: 158, sat: 80, lightSat: 55, darkSat: 56, lightL: 95.5, darkL: 8.5 },
  { id: "ocean", label: "Ocean Blue", group: "Bold", hue: 205, sat: 88, lightSat: 70, darkSat: 62, lightL: 95.5, darkL: 9 },
  { id: "forest", label: "Forest", group: "Bold", hue: 140, sat: 62, lightSat: 35, darkSat: 40, lightL: 95, darkL: 8.5 },
  // Cool and neutral
  { id: "slate", label: "Graphite", group: "Cool and neutral", hue: 215, sat: 18, lightSat: 8, darkSat: 6, lightL: 96, darkL: 9 },
  { id: "midnight", label: "Midnight", group: "Cool and neutral", hue: 236, sat: 64, lightSat: 45, darkSat: 62, lightL: 96, darkL: 8 },
  { id: "sand", label: "Sand", group: "Cool and neutral", hue: 34, sat: 48, lightSat: 55, darkSat: 22, lightL: 95.5, darkL: 10 },
];

export interface ThemeTokens {
  /** semantic tokens: --background, --card, --foreground, --muted-foreground, --border, --input, --primary, ... */
  vars: Record<string, string>;
  /** replaces --color-slate-* (empty for the default theme, whose ramp is in globals.css) */
  slate: Partial<Ramp>;
  /** replaces --color-brand-* */
  brand: Partial<Ramp>;
}
export interface ThemeDef {
  id: AccentId;
  label: string;
  group: AccentGroup;
  light: ThemeTokens;
  dark: ThemeTokens;
}

const BRAND_L: Record<number, number> = { 50: 97, 100: 94, 200: 87, 300: 77, 400: 66, 500: 55, 600: 44, 700: 37, 800: 30, 900: 25, 950: 15 };

/** Steps lightness from `start` in direction `dir` until the colour reaches `min` contrast against every background. */
function fit(h: number, s: number, start: number, dir: 1 | -1, bgs: string[], min: number): string {
  let l = start;
  for (let i = 0; i < 100; i++) {
    const c = hsl(h, s, l);
    if (bgs.every((b) => contrast(c, b) >= min)) return c;
    l += dir;
  }
  return hsl(h, s, l);
}

function brandRamp(h: number, s: number): Ramp {
  const out = {} as Ramp;
  for (const sh of SHADES) out[sh] = hsl(h, sh <= 100 ? Math.min(100, s + 10) : s, BRAND_L[sh]);
  out[600] = fit(h, s, 44, -1, ["#FFFFFF"], 4.8);
  const l600 = rgbToHsl(out[600])[2];
  out[700] = fit(h, s, Math.min(37, l600 - 6), -1, ["#FFFFFF"], 6);
  const l700 = rgbToHsl(out[700])[2];
  out[800] = hsl(h, s, l700 - 7);
  out[900] = hsl(h, s, l700 - 12);
  out[950] = hsl(h, Math.max(40, s - 15), 15);
  return out;
}

function build(seed: ThemeSeed): ThemeDef {
  const sh = seed.hue;
  const lightBg = seed.lightBg ?? hsl(sh, seed.lightSat, seed.lightL);
  const lightCard = hsl(sh, seed.lightSat, 99.4);
  const darkBg = seed.darkBg ?? hsl(sh, seed.darkSat, seed.darkL);
  const [dh, ds, dl] = rgbToHsl(darkBg);
  const darkCard = hsl(dh, ds, dl + 4);
  const brand = brandRamp(seed.hue, seed.sat);
  const [, , lbL] = rgbToHsl(lightBg);
  const ns = Math.min(seed.lightSat, 40); // text neutrals stay lightly tinted

  const lightSlate: Ramp = {
    50: lightBg,
    100: hsl(sh, seed.lightSat, lbL - 2.5),
    200: hsl(sh, Math.min(seed.lightSat, 60), lbL - 7.5),
    300: hsl(sh, Math.min(seed.lightSat, 45), 80),
    400: hsl(sh, ns, 60),
    500: fit(sh, ns, 46, -1, [lightBg, lightCard, "#FFFFFF"], 4.8),
    600: hsl(sh, ns, 33),
    700: hsl(sh, ns + 5, 24),
    800: hsl(sh, ns + 8, 17),
    900: hsl(sh, ns + 10, 11),
    950: hsl(sh, ns + 10, 7),
  };
  const dsat = Math.min(ds, 45);
  const darkSlate: Ramp = {
    50: hsl(sh, 40, 96),
    100: hsl(sh, 38, 93),
    200: hsl(sh, 34, 87),
    300: hsl(sh, 30, 79),
    400: fit(sh, dsat, 70, 1, [darkBg, darkCard], 4.8),
    500: fit(sh, dsat, 62, 1, [darkBg, darkCard], 4.8),
    600: hsl(sh, dsat, 42),
    700: hsl(dh, ds, dl + 20),
    800: hsl(dh, ds, dl + 12),
    900: darkCard,
    950: darkBg,
  };

  const darkBrand: Ramp = { ...brand };
  darkBrand[300] = fit(seed.hue, seed.sat, 77, 1, [darkBg, darkCard], 4.8);
  darkBrand[400] = fit(seed.hue, seed.sat, 66, 1, [darkBg, darkCard], 4.8);

  return {
    id: seed.id,
    label: seed.label,
    group: seed.group,
    light: {
      slate: lightSlate,
      brand,
      vars: {
        "--background": lightBg,
        "--foreground": lightSlate[900],
        "--card": lightCard,
        "--card-foreground": lightSlate[900],
        "--popover": lightCard,
        "--popover-foreground": lightSlate[900],
        "--primary": brand[600],
        "--primary-foreground": "#FFFFFF",
        "--secondary": lightSlate[100],
        "--secondary-foreground": lightSlate[900],
        "--muted": lightSlate[100],
        "--muted-foreground": lightSlate[500],
        "--border": lightSlate[200],
        "--input": lightSlate[300],
        "--ring": brand[600],
      },
    },
    dark: {
      slate: darkSlate,
      brand: darkBrand,
      vars: {
        "--background": darkBg,
        "--foreground": darkSlate[100],
        "--card": darkCard,
        "--card-foreground": darkSlate[100],
        "--popover": hsl(dh, ds, dl + 7),
        "--popover-foreground": darkSlate[100],
        "--primary": brand[600],
        "--primary-foreground": "#FFFFFF",
        "--secondary": darkSlate[800],
        "--secondary-foreground": darkSlate[100],
        "--muted": hsl(dh, ds, dl + 2.5),
        "--muted-foreground": darkSlate[400],
        "--border": darkSlate[800],
        "--input": darkSlate[700],
        "--ring": darkBrand[400],
      },
    },
  };
}

/** The default theme: identical to the base tokens in app/globals.css (the test compares them). */
const BLUE: ThemeDef = {
  id: "blue",
  label: "Sunroot Blue",
  group: "Cool and neutral",
  light: {
    vars: { "--background": "#F6F7FB", "--card": "#FFFFFF", "--foreground": "#141829", "--muted-foreground": "#5A6482", "--border": "#DFE3EE", "--primary": "#3552E0" },
    slate: {},
    brand: { 300: "#9DB4FF", 400: "#6F8DFF", 600: "#3552E0", 800: "#243792" },
  },
  dark: {
    vars: { "--background": "#0B0E1A", "--card": "#121629", "--foreground": "#E7EAF5", "--muted-foreground": "#98A1BB", "--border": "#1F2538", "--primary": "#4A6CF7" },
    slate: {},
    brand: { 300: "#9DB4FF", 400: "#6F8DFF", 600: "#3552E0", 800: "#243792" },
  },
};

export const THEMES: ThemeDef[] = [BLUE, ...SEEDS.map(build)];

/** Picker data: swatches of page + card + accent for each mode. */
export const ACCENTS = THEMES.map((t) => ({
  id: t.id,
  label: t.label,
  group: t.group,
  light: [t.light.vars["--background"], t.light.vars["--card"], t.light.brand[600]!] as [string, string, string],
  dark: [t.dark.vars["--background"], t.dark.vars["--card"], t.dark.brand[400]!] as [string, string, string],
}));

export const ACCENT_PICKER_GROUPS = ACCENT_GROUPS.map((group) => ({ group, items: ACCENTS.filter((a) => a.group === group) }));

function rampCss(prefix: string, r: Partial<Ramp>): string {
  return SHADES.map((s) => `  --color-${prefix}-${s}: ${r[s]!.toLowerCase()};`).join("\n");
}
function varsCss(v: Record<string, string>): string {
  return Object.entries(v).map(([k, val]) => `  ${k}: ${val.toLowerCase()};`).join("\n");
}

/** The full text of app/accents.css (regenerate with `npm run gen:accents`). */
export function generateAccentsCss(): string {
  const head = `/*
 * GENERATED by \`npm run gen:accents\` from lib/settings/accents.ts. Do not edit by hand.
 * Each [data-accent] theme re-tints the whole interface in light and dark: the brand (action) scale, the neutral ramp
 * (--color-slate-*, read by every bg-slate-*, text-slate-*, border-slate-* utility) and the semantic tokens (--background, --card,
 * --border, --muted ...). Dark mode is the .dark class on <html>. "blue" is the default and lives in globals.css.
 * Gold rewards, success/danger colours and the mastery scale are not touched. Shop themes recolour only the teal scale.
 */
`;
  const blocks = THEMES.filter((t) => t.id !== "blue").map((t) => {
    const l = `:root[data-accent="${t.id}"] {\n${rampCss("brand", t.light.brand)}\n${rampCss("slate", t.light.slate)}\n${varsCss(t.light.vars)}\n}`;
    const d = `:root.dark[data-accent="${t.id}"] {\n${rampCss("brand", t.dark.brand)}\n${rampCss("slate", t.dark.slate)}\n${varsCss(t.dark.vars)}\n}`;
    return `/* ${t.label} (${t.group}) */\n${l}\n${d}`;
  });
  return head + "\n" + blocks.join("\n\n") + "\n";
}

/**
 * Inline pre-paint script body: applies the saved theme before first paint on every page that uses the root layout (landing,
 * login, signup, the app). The stored value is validated against the known list. Light/dark is applied by the script before it.
 */
export const ACCENT_BOOT_SCRIPT =
  "(function(){try{var p=JSON.parse(localStorage.getItem('sunroot.prefs')||'null');var a=p&&p.accent;var ok=" +
  JSON.stringify(ACCENT_IDS.filter((i) => i !== "blue")) +
  ";if(a&&ok.indexOf(a)>-1)document.documentElement.setAttribute('data-accent',a)}catch(e){}})()";
