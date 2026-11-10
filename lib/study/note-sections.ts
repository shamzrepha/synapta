/** Splits a lesson written in markdown into notebook pages (one per heading), ignoring "#" lines inside code fences. */

export interface NotePage {
  id: string;
  title: string;
  body: string;
  /** an "Overview" page made for text that sat above the first heading */
  synthetic?: boolean;
}
export interface SplitNote {
  title: string | null;
  pages: NotePage[];
}

const clean = (s: string) => s.replace(/[*_`]/g, "").trim();

export function splitNote(markdown: string): SplitNote {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  type Raw = { level: number; title: string; lines: string[] };
  const raws: Raw[] = [{ level: 0, title: "", lines: [] }];
  let fence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const m = !fence ? /^(#{1,2})\s+(.+?)\s*#*\s*$/.exec(line) : null;
    if (m) raws.push({ level: m[1].length, title: clean(m[2]), lines: [] });
    else raws[raws.length - 1].lines.push(line);
  }

  let title: string | null = null;
  const hasH2 = raws.some((r) => r.level === 2);
  const pages: NotePage[] = [];
  raws.forEach((r, i) => {
    const body = r.lines.join("\n").trim();
    if (r.level === 0) {
      if (body) pages.push({ id: "p0", title: "Overview", body, synthetic: true });
      return;
    }
    // a lone top heading above "##" headings is the note's title, not a page of its own
    if (r.level === 1 && hasH2 && title === null && pages.length === 0) {
      title = r.title;
      if (body) pages.push({ id: `p${i}`, title: "Overview", body, synthetic: true });
      return;
    }
    if (!body && !r.title) return;
    pages.push({ id: `p${i}`, title: r.title, body });
  });
  if (pages.length === 0) pages.push({ id: "p0", title: "", body: String(markdown || "").trim() });
  return { title, pages };
}

/** Rough reading time for a page, in whole minutes (at least 1). */
export function readMinutes(text: string): number {
  const words = (text.match(/\S+/g) || []).length;
  return Math.max(1, Math.round(words / 200));
}
