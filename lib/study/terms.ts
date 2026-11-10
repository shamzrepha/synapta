/** Helpers for the tappable key words in a lesson. */

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Keeps only sensible terms that really appear in the text (case-insensitive), without duplicates. */
export function filterTerms(terms: string[], text: string, max = 40): string[] {
  const hay = text.toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms) {
    const t = String(raw || "").trim();
    if (t.length < 2 || t.length > 60 || t.split(/\s+/).length > 5) continue;
    const k = t.toLowerCase();
    if (seen.has(k) || !hay.includes(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** One regex matching any of the terms as whole words, longest first. Null when there are none. */
export function termRegex(terms: string[]): RegExp | null {
  const list = [...new Set(terms.map((t) => t.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (list.length === 0) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])(${list.map(esc).join("|")})(?![\\p{L}\\p{N}])`, "giu");
}

/** Splits text into plain pieces and matched terms. Each term (case-insensitive) is marked only once per call. */
export function splitByTerms(text: string, re: RegExp | null, used: Set<string>): Array<{ text: string; term: boolean }> {
  if (!re) return [{ text, term: false }];
  const out: Array<{ text: string; term: boolean }> = [];
  let last = 0;
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const key = m[0].toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    if (m.index > last) out.push({ text: text.slice(last, m.index), term: false });
    out.push({ text: m[0], term: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), term: false });
  return out.length ? out : [{ text, term: false }];
}

/** A simple stable hash for caching a lesson's term list. */
export function hashText(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + s.length.toString(36);
}
