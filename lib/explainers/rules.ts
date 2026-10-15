/** Validation rules for 60-second explainer videos. Pure so they can be tested. */

export const MAX_SECONDS = 60;
export const MAX_BYTES = 25 * 1024 * 1024;
export const MAX_TAGS = 5;

export interface VideoKind {
  type: string;
  ext: string;
}

/** Identify a video by its first bytes (never trust the claimed type). */
export function sniffVideo(b: Uint8Array): VideoKind | null {
  if (b.length < 12) return null;
  // MP4 / MOV: "ftyp" box at offset 4
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    return brand.startsWith("qt") ? { type: "video/quicktime", ext: "mov" } : { type: "video/mp4", ext: "mp4" };
  }
  // WebM / Matroska: EBML header
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { type: "video/webm", ext: "webm" };
  return null;
}

export function normalizeTags(input: unknown): string[] {
  const parts = Array.isArray(input) ? input : typeof input === "string" ? input.split(/[\s,]+/) : [];
  const out: string[] = [];
  for (const p of parts) {
    const t = String(p).replace(/^#+/, "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30);
    if (t.length >= 2 && !out.includes(t)) out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** Returns an error message, or null when the upload is acceptable. */
export function validateUpload(p: { bytes: number; durationSec: number; title: string }): string | null {
  if (!p.title.trim()) return "Give your explainer a title.";
  if (p.title.trim().length > 100) return "Title is too long (100 characters max).";
  if (!(p.bytes > 0)) return "That file is empty.";
  if (p.bytes > MAX_BYTES) return "Video is too large (25 MB max).";
  if (!(p.durationSec > 0)) return "Couldn't read the video length.";
  if (p.durationSec > MAX_SECONDS + 0.5) return "Explainers can be at most 60 seconds.";
  return null;
}

/** Parses an HTTP Range header ("bytes=0-99") against a file size; null means serve the whole file. */
export function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start: number;
  let end: number;
  if (m[1] === "") {
    const n = Number(m[2]);
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!(start <= end) || start >= size) return null;
  return { start, end };
}
