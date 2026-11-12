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

export type TextbookSectionKind = "overview" | "section" | "example" | "mistakes" | "terms" | "check";

export interface TextbookPage {
  id: string;
  sectionTitle: string;
  title: string;
  subtopic: string | null;
  /** every sub-section on the page, in order */
  subtopics?: string[];
  sectionIndex: number;
  partIndex: number;
  partTotal: number;
  kind: TextbookSectionKind;
  body: string;
  synthetic?: boolean;
}

export interface TextbookSplit {
  title: string | null;
  pages: TextbookPage[];
}

function classifyKind(sectionTitle: string, title: string, idx: number): TextbookSectionKind {
  const txt = `${sectionTitle} ${title}`.toLowerCase();
  if (/quick check|check yourself|quiz|self[- ]test|recall/.test(txt)) return "check";
  if (/worked example|example|walkthrough|calculation|sample problem/.test(txt)) return "example";
  if (/common mistake|misconception|pitfall|watch out|avoid/.test(txt)) return "mistakes";
  if (/key term|glossary|vocabulary|summary|takeaway|recap/.test(txt)) return "terms";
  if (idx === 0 || /overview|introduction|intro|why this matters/.test(txt)) return "overview";
  return "section";
}

export function splitAtomicBlocks(text: string): string[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let buf: string[] = [];
  let inFence = false;
  let inMath = false;

  const flush = () => {
    const joined = buf.join("\n").trim();
    if (joined) blocks.push(joined);
    buf = [];
  };

  for (const line of lines) {
    const t = line.trim();
    if (/^(\x60{3}|~~~)/.test(t)) {
      inFence = !inFence;
      buf.push(line);
      if (!inFence) flush();
      continue;
    }
    if (!inFence && t === "$$") {
      inMath = !inMath;
      buf.push(line);
      if (!inMath) flush();
      continue;
    }
    if (!inFence && !inMath && t === "") {
      flush();
      continue;
    }
    buf.push(line);
  }
  flush();
  return blocks;
}

const wordCount = (str: string) => (str.match(/\S+/g) || []).length;

/**
 * Splits a lesson into balanced textbook pages: dives into ## chapters and ### subtopics,
 * overflows long sections gracefully across continuation pages without breaking math/code blocks,
 * and avoids tiny orphan tail pages.
 */
export function splitTextbookPages(markdown: string, opts?: { maxWords?: number }): TextbookSplit {
  const maxWords = Math.max(120, opts?.maxWords ?? 520);
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  type Chunk = { level: 0 | 1 | 2 | 3; title: string; sectionTitle: string; sectionIndex: number; lines: string[] };
  const chunks: Chunk[] = [{ level: 0, title: "", sectionTitle: "", sectionIndex: 0, lines: [] }];

  let inFence = false;
  let inMath = false;
  let curH2 = "";
  let secIdx = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(\x60{3}|~~~)/.test(trimmed)) {
      inFence = !inFence;
      chunks[chunks.length - 1].lines.push(line);
      continue;
    }
    if (!inFence && trimmed === "$$") {
      inMath = !inMath;
      chunks[chunks.length - 1].lines.push(line);
      continue;
    }
    const m = !inFence && !inMath ? /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line) : null;
    if (!m) {
      chunks[chunks.length - 1].lines.push(line);
      continue;
    }
    const lvl = m[1].length as 1 | 2 | 3;
    const heading = clean(m[2]);
    if (lvl <= 2) {
      curH2 = heading;
      secIdx += 1;
      chunks.push({ level: lvl, title: heading, sectionTitle: heading, sectionIndex: secIdx, lines: [] });
    } else {
      chunks.push({ level: 3, title: heading, sectionTitle: curH2 || heading, sectionIndex: Math.max(1, secIdx), lines: [] });
    }
  }

  let docTitle: string | null = null;
  const hasH2 = chunks.some((c) => c.level === 2);

  type Unit = { sectionTitle: string; title: string; subtopic: string | null; sectionIndex: number; body: string; synthetic?: boolean };
  const units: Unit[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const body = c.lines.join("\n").trim();
    if (c.level === 0) {
      if (body) units.push({ sectionTitle: "Overview", title: "Overview", subtopic: null, sectionIndex: 0, body, synthetic: true });
      continue;
    }
    if (c.level === 1 && hasH2 && docTitle === null && units.length === 0) {
      docTitle = c.title;
      if (body) units.push({ sectionTitle: "Overview", title: "Overview", subtopic: null, sectionIndex: 0, body, synthetic: true });
      continue;
    }
    const next = chunks[i + 1];
    if (c.level === 2 && next?.level === 3 && wordCount(body) < 45) {
      const nextBody = next.lines.join("\n").trim();
      const merged = [body, nextBody].filter(Boolean).join("\n\n");
      units.push({
        sectionTitle: c.title,
        title: c.title,
        subtopic: next.title,
        sectionIndex: c.sectionIndex,
        body: merged,
      });
      i += 1;
      continue;
    }
    if (!body && !c.title) continue;
    units.push({
      sectionTitle: c.sectionTitle || c.title,
      title: c.level === 3 ? (c.sectionTitle || c.title) : c.title,
      subtopic: c.level === 3 ? c.title : null,
      sectionIndex: c.sectionIndex,
      body,
    });
  }

  // A page is a full textbook page: one "##" section with its "###" sub-sections, up to about maxWords. A long section runs
  // over at sub-section boundaries; tiny sections (a short "Key terms") join the page before instead of standing alone.
  type Pack = { units: Unit[]; words: number };
  const packs: Pack[] = [];
  for (const u of units) {
    const w = wordCount(u.body) + (u.subtopic ? 3 : 0);
    const last = packs[packs.length - 1];
    const lastUnit = last?.units[last.units.length - 1];
    const sameSection = !!last && !!lastUnit && !u.synthetic && !lastUnit.synthetic && lastUnit.sectionIndex === u.sectionIndex;
    // a short "Key terms" or "Common mistakes" joins the page before; a quick check or a worked example always stays on its own page
    const tinyKind = classifyKind(u.sectionTitle, u.subtopic || u.title, 1);
    const tiny = !!last && !!lastUnit && !u.synthetic && !lastUnit.synthetic && wordCount(u.body) < 120 && tinyKind !== "check" && tinyKind !== "example";
    if (last && ((sameSection && last.words + w <= maxWords) || (tiny && last.words + w <= maxWords * 1.15))) {
      last.units.push(u);
      last.words += w;
    } else {
      packs.push({ units: [u], words: w });
    }
  }

  const pages: TextbookPage[] = [];
  packs.forEach((pk, pIdx) => {
    const first = pk.units[0];
    const multi = pk.units.length > 1;
    // with several parts on one page every sub-section keeps its own heading inside the page
    const bodyOf = (u: Unit, idx: number) => (multi || idx > 0 ? [u.subtopic ? `### ${u.subtopic}` : u.title !== first.title ? `## ${u.title}` : "", u.body].filter(Boolean).join("\n\n") : u.body);
    const body = pk.units.map(bodyOf).join("\n\n").trim();
    const subtopics = pk.units.map((u) => u.subtopic).filter((x): x is string => !!x);
    const kind = classifyKind(first.sectionTitle, first.subtopic || first.title, pIdx);
    const base = { sectionTitle: first.sectionTitle, title: first.title, subtopic: multi ? null : first.subtopic, subtopics, sectionIndex: first.sectionIndex, kind, synthetic: first.synthetic };
    if (wordCount(body) <= maxWords * 1.3 || multi) {
      pages.push({ id: `tp-${pIdx}-0`, ...base, partIndex: 0, partTotal: 1, body });
      return;
    }
    // one very long unit: break it between whole paragraphs, never inside a $$ block or code fence
    const blocks = splitAtomicBlocks(body);
    const groups: string[] = [];
    let cur: string[] = [];
    let curW = 0;
    for (const blk of blocks) {
      const bw = wordCount(blk);
      if (cur.length > 0 && curW + bw > maxWords) {
        groups.push(cur.join("\n\n"));
        cur = [blk];
        curW = bw;
      } else {
        cur.push(blk);
        curW += bw;
      }
    }
    if (cur.length > 0) {
      if (groups.length > 0 && curW < 60 && wordCount(groups[groups.length - 1]) + curW <= maxWords * 1.3) {
        groups[groups.length - 1] = `${groups[groups.length - 1]}\n\n${cur.join("\n\n")}`;
      } else {
        groups.push(cur.join("\n\n"));
      }
    }
    groups.forEach((g, partIndex) => pages.push({ id: `tp-${pIdx}-${partIndex}`, ...base, partIndex, partTotal: groups.length, body: g }));
  });

  if (pages.length === 0) {
    pages.push({
      id: "tp-0-0",
      sectionTitle: "",
      title: "",
      subtopic: null,
      sectionIndex: 0,
      partIndex: 0,
      partTotal: 1,
      kind: "overview",
      body: String(markdown || "").trim(),
    });
  }
  return { title: docTitle, pages };
}
