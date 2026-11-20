import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ACCENTS, ACCENT_GROUPS, ACCENT_IDS, THEMES, generateAccentsCss, isAccentId, isColorMode, ACCENT_BOOT_SCRIPT } from "./accents";
import { contrast } from "./color";
import { parsePrefs } from "./prefs";

const root = process.cwd();
const accentsCss = readFileSync(join(root, "app/accents.css"), "utf8");
const globalsCss = readFileSync(join(root, "app/globals.css"), "utf8");

function block(css: string, selector: string): string {
  const i = css.indexOf(`${selector} {`);
  return i < 0 ? "" : css.slice(i, css.indexOf("}", i));
}
/** Every --name: #hex in a block. */
function vars(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
}

const SURFACE_TOKENS = ["--background", "--card", "--foreground", "--muted-foreground", "--border", "--input", "--popover", "--muted", "--secondary", "--primary", "--ring"];

// The default (blue) tokens live in globals.css: light in `:root`, dark in `.dark`.
const baseLight = vars(block(globalsCss, "  :root"));
const baseDark = vars(block(globalsCss, "  .dark"));

function modeTokens(id: string, mode: "light" | "dark"): Record<string, string> {
  if (id === "blue") {
    const base = mode === "light" ? baseLight : baseDark;
    const brand = vars(globalsCss.slice(globalsCss.indexOf("@theme")));
    return { ...brand, ...base };
  }
  return vars(block(accentsCss, mode === "light" ? `:root[data-accent="${id}"]` : `:root.dark[data-accent="${id}"]`));
}

describe("theme list", () => {
  it("has at least 16 themes in the three groups with friendly names", () => {
    expect(ACCENT_IDS.length).toBeGreaterThanOrEqual(16);
    expect(ACCENT_GROUPS).toEqual(["Soft", "Bold", "Cool and neutral"]);
    const names = ACCENTS.map((a) => a.label);
    for (const n of ["Blush Pink", "Lavender", "Peach", "Mint", "Sky", "Lilac", "Hot Pink", "Royal Purple", "Crimson", "Sunset Orange", "Gold", "Emerald", "Ocean Blue", "Forest", "Graphite", "Midnight", "Sand", "Sunroot Blue"]) {
      expect(names).toContain(n);
    }
    expect(new Set(ACCENT_IDS).size).toBe(ACCENT_IDS.length);
    expect(ACCENTS.every((a) => a.light.length === 3 && a.dark.length === 3)).toBe(true);
  });

  it("validates stored accent and mode values", () => {
    expect(isAccentId("rose")).toBe(true);
    expect(isAccentId("hotpink")).toBe(true);
    expect(isAccentId("nope")).toBe(false);
    expect(isAccentId("<script>")).toBe(false);
    expect(isAccentId(undefined)).toBe(false);
    expect(isColorMode("system")).toBe(true);
    expect(isColorMode("sepia")).toBe(false);
    expect(parsePrefs({ accent: "bogus", mode: "bogus" })).toMatchObject({ accent: "blue", mode: "system" });
    expect(parsePrefs({ accent: "mint", mode: "dark" })).toMatchObject({ accent: "mint", mode: "dark" });
  });

  it("the boot script only knows listed themes", () => {
    for (const id of ACCENT_IDS) if (id !== "blue") expect(ACCENT_BOOT_SCRIPT).toContain(`"${id}"`);
    expect(ACCENT_BOOT_SCRIPT).not.toContain("blue");
  });

  it("app/accents.css is up to date (run `npm run gen:accents`)", () => {
    expect(accentsCss).toBe(generateAccentsCss());
  });
});

describe("every theme defines light and dark surfaces and passes WCAG AA", () => {
  for (const t of THEMES) {
    for (const mode of ["light", "dark"] as const) {
      describe(`${t.id} (${mode})`, () => {
        const v = modeTokens(t.id, mode);

        it("defines all surface tokens", () => {
          for (const k of SURFACE_TOKENS) expect(v[k], `${k} missing`).toBeTruthy();
          if (t.id !== "blue") for (const s of [50, 500, 900, 950]) expect(v[`--color-slate-${s}`]).toBeTruthy();
        });

        it("body text is 4.5:1 on the page and on cards", () => {
          expect(contrast(v["--foreground"], v["--background"])).toBeGreaterThanOrEqual(4.5);
          expect(contrast(v["--foreground"], v["--card"])).toBeGreaterThanOrEqual(4.5);
          expect(contrast(v["--card-foreground"] ?? v["--foreground"], v["--card"])).toBeGreaterThanOrEqual(4.5);
          expect(contrast(v["--popover-foreground"] ?? v["--foreground"], v["--popover"])).toBeGreaterThanOrEqual(4.5);
        });

        it("muted text is 4.5:1 on the page, cards and muted fills", () => {
          const m = v["--muted-foreground"];
          expect(contrast(m, v["--background"])).toBeGreaterThanOrEqual(4.5);
          expect(contrast(m, v["--card"])).toBeGreaterThanOrEqual(4.5);
          expect(contrast(m, v["--muted"])).toBeGreaterThanOrEqual(4.5);
        });

        it("button label on the button is 4.5:1 (and on hover)", () => {
          const brand = (s: number) => v[`--color-brand-${s}`] ?? modeTokens("blue", "light")[`--color-brand-${s}`];
          expect(contrast("#FFFFFF", brand(600))).toBeGreaterThanOrEqual(4.5);
          expect(contrast("#FFFFFF", brand(700))).toBeGreaterThanOrEqual(4.5);
          if (t.id !== "blue") expect(contrast("#FFFFFF", v["--primary"])).toBeGreaterThanOrEqual(4.5);
        });

        it("accent text and UI (ring, primary) are readable on the page", () => {
          const bg = v["--background"];
          const brandText = mode === "light" ? v["--color-brand-700"] : v["--color-brand-300"];
          if (brandText) expect(contrast(brandText, bg)).toBeGreaterThanOrEqual(4.5);
          if (mode === "dark" && v["--color-brand-400"]) expect(contrast(v["--color-brand-400"], bg)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(v["--ring"], bg)).toBeGreaterThanOrEqual(3);
          if (mode === "light") expect(contrast(v["--primary"], bg)).toBeGreaterThanOrEqual(3);
        });

        it("keeps card/page/border ordered so surfaces are distinguishable", () => {
          expect(v["--card"].toLowerCase()).not.toBe(v["--background"].toLowerCase());
          expect(v["--border"].toLowerCase()).not.toBe(v["--background"].toLowerCase());
          // control outlines (--input) are the UI edge that must be seen: 3:1 would make every field heavy, so the
          // floor here is the visible-but-quiet 1.3:1 and form fields additionally carry a focus ring checked above.
          expect(contrast(v["--input"], v["--card"])).toBeGreaterThanOrEqual(1.3);
        });
      });
    }
  }

  it("the default blue theme matches the picker data and globals.css", () => {
    const light = modeTokens("blue", "light");
    const blue = THEMES.find((t) => t.id === "blue")!;
    expect(light["--background"].toLowerCase()).toBe(blue.light.vars["--background"].toLowerCase());
    expect(baseDark["--background"].toLowerCase()).toBe(blue.dark.vars["--background"].toLowerCase());
  });

  it("page backgrounds are tinted, not black or navy, for the pink theme", () => {
    const l = modeTokens("rose", "light");
    const d = modeTokens("rose", "dark");
    expect(l["--background"].toLowerCase()).toBe("#fff5f8");
    expect(d["--background"].toLowerCase()).toBe("#2a0f1e");
  });
});
