/**
 * A long textbook or course pack can be far bigger than one AI request. To build a class from it we keep what shows its
 * STRUCTURE (headings, chapter and unit lines, the contents page) from the whole document, plus the opening text verbatim.
 */

/** Same limit the class-build API enforces on the seed text (lib/teacher/classBuildRequest.ts). */
export const SYLLABUS_SEED_MAX = 60_000;

const HEADING_WORD = /^(chapter|unit|module|week|lesson|topic|part|section|lecture|session|appendix)\b/i;
const NUMBERED = /^(\d+(\.\d+){0,3}|[IVXLC]+)[.)]?\s+\S/;

export function looksLikeHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 90) return false;
  if (/^#{1,6}\s/.test(t) || HEADING_WORD.test(t)) return true;
  if (NUMBERED.test(t) && !/[.!?]$/.test(t)) return true;
  const letters = t.replace(/[^A-Za-z]/g, "");
  // ALL CAPS lines are headings in most course documents; page numbers and short noise are not
  return letters.length >= 4 && letters === letters.toUpperCase() && !/\d{4,}/.test(t);
}

export interface Condensed {
  text: string;
  condensed: boolean;
  headings: number;
}

export function condenseForSyllabus(text: string, max = 60_000, headKeep = 18_000): Condensed {
  const full = (text || "").trim();
  const lines = full.split("\n");
  const headings = lines.filter(looksLikeHeading).length;
  if (full.length <= max) return { text: full, condensed: false, headings };

  const head = full.slice(0, headKeep);
  let used = head.length;
  const picked: string[] = [];
  const budget = max - headKeep - 200;
  // keep the document's page markers next to the headings so topics can name where they come from
  let page = "";
  const seen = new Set<string>();
  for (const raw of lines.slice(head.split("\n").length)) {
    const m = /^\[(Page|Slide) \d+\]$/.exec(raw.trim());
    if (m) {
      page = raw.trim();
      continue;
    }
    if (!looksLikeHeading(raw)) continue;
    const t = raw.trim();
    if (seen.has(t)) continue;
    seen.add(t);
    const entry = page ? `${t}  ${page}` : t;
    if (used + entry.length + 1 > budget + headKeep) break;
    picked.push(entry);
    used += entry.length + 1;
  }
  return {
    text: `${head}\n\n[The rest of this long document is shown as its headings only, in order:]\n${picked.join("\n")}`,
    condensed: true,
    headings: headings,
  };
}
