/**
 * The Android shell can colour its status and navigation bars to match the page, so the app looks like one piece with the website
 * (a light theme gets light bars with dark icons, a dark theme gets dark bars). The shell exposes `window.SunrootBars.set(background, lightBackground)`;
 * in a normal browser nothing exists and this does nothing.
 */
export interface BarsBridge {
  set: (backgroundCss: string, lightBackground: boolean) => void;
}

/** "rgb(11, 14, 26)" or "rgba(...)" to #rrggbb, or null for transparent or anything unreadable. */
export function rgbToHex(css: string): string | null {
  const m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([\d.]+))?\s*\)$/i.exec(css.trim());
  if (!m) return null;
  const a = m[4] === undefined ? 1 : Number(m[4]);
  if (!(a > 0.5)) return null;
  const hex = [m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("");
  return `#${hex}`;
}

/** WCAG relative luminance above about 0.5 reads as a light surface (so the bar icons should be dark). */
export function isLightHex(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return l > 0.4;
}
