import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ACCENTS, ACCENT_IDS } from "./accents";

const root = process.cwd();
const accentsCss = readFileSync(join(root, "app/accents.css"), "utf8");
const globalsCss = readFileSync(join(root, "app/globals.css"), "utf8");

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
function tokens(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/--color-brand-(\d+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
}
function block(css: string, selector: string): string {
  const i = css.indexOf(`${selector} {`);
  return i < 0 ? "" : css.slice(i, css.indexOf("}", i));
}

const DARK_BG = "#0B0E1A";
const LIGHT_BG = "#FFFFFF";

describe("accent palettes", () => {
  const scales: Record<string, Record<string, string>> = { blue: tokens(globalsCss.slice(globalsCss.indexOf("@theme"))) };
  for (const id of ACCENT_IDS) if (id !== "blue") scales[id] = tokens(block(accentsCss, `:root[data-accent="${id}"]`));

  for (const id of ACCENT_IDS) {
    it(`${id}: complete scale, white on brand-600 reaches AA, text shades readable`, () => {
      const s = scales[id];
      expect(Object.keys(s).length).toBeGreaterThanOrEqual(11);
      expect(contrast("#FFFFFF", s["600"])).toBeGreaterThanOrEqual(4.5);
      expect(contrast("#FFFFFF", s["700"])).toBeGreaterThanOrEqual(4.5); // hover state
      expect(contrast(s["700"], LIGHT_BG)).toBeGreaterThanOrEqual(4.5); // links/headings on light
      const dark = id === "blue" ? {} : tokens(block(accentsCss, `:root[data-accent="${id}"].dark`));
      expect(contrast(dark["300"] ?? s["300"], DARK_BG)).toBeGreaterThanOrEqual(4.5); // text on dark
      expect(contrast(dark["400"] ?? s["400"], DARK_BG)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${id}: picker swatches match the CSS`, () => {
      const a = ACCENTS.find((x) => x.id === id)!;
      const s = scales[id];
      expect(a.swatch.map((h) => h.toLowerCase())).toEqual([s["300"], s["600"], s["800"]].map((h) => h.toLowerCase()));
    });
  }
});
