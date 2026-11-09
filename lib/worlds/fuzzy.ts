/** Text matching used by the grounding checks (spec 9.3): lenient about case, punctuation and spacing, strict about words. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const tokens = (s: string): string[] => normalize(s).split(" ").filter(Boolean);

export function jaccard(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * True when `needle` appears in `haystack` (>= `threshold` of its words, in a window of about the same length).
 * An exact normalised substring always passes. This is what makes "excerpt must be copied from the source" checkable.
 */
export function fuzzyContains(haystack: string, needle: string, threshold = 0.9): boolean {
  const h = normalize(haystack);
  const n = normalize(needle);
  if (!n) return false;
  if (h.includes(n)) return true;
  const ht = h.split(" ");
  const nt = n.split(" ");
  if (nt.length === 0 || ht.length === 0) return false;
  const need = new Set(nt);
  const win = nt.length;
  let best = 0;
  for (let i = 0; i + 1 <= ht.length; i++) {
    const w = ht.slice(i, i + win);
    let hit = 0;
    for (const t of need) if (w.includes(t)) hit++;
    best = Math.max(best, hit / need.size);
    if (best >= threshold) return true;
  }
  return best >= threshold;
}

export const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;
