const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
/** ~3 MB of base64: well above a compressed photo (<= ~900k chars), small enough to be safe. */
export const MAX_SNAP_BASE64 = 3_000_000;

/** Splits a data URL into the parts Gemini wants; null when it isn't a small supported image. */
export function parseImageDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl || "");
  if (!m) return null;
  const mimeType = m[1].toLowerCase();
  const data = m[2].replace(/\s+/g, "");
  if (!ALLOWED.includes(mimeType) || data.length < 100 || data.length > MAX_SNAP_BASE64) return null;
  return { mimeType, data };
}

/** A short history title from the AI's markdown answer. */
export function deriveSnapTitle(markdown: string, fallback = "Homework problem"): string {
  for (const raw of markdown.split("\n")) {
    const line = raw
      .replace(/^[#>*\-\s\d.)]+/, "")
      .replace(/[*_`$]/g, "")
      .trim();
    if (line.length >= 3) return line.length > 70 ? `${line.slice(0, 67)}…` : line;
  }
  return fallback;
}
