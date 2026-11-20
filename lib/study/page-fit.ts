/**
 * Fixed-lines pages, like a printed textbook. A page holds a set number of lines; whatever does not fit moves to the next page,
 * so the learner turns pages instead of scrolling inside one. The line cost of each block is an estimate from its text and the
 * page width, kept a little generous so a page never overflows.
 */

export interface PageBudget {
  /** lines of body text that fit on one page */
  maxLines: number;
  /** characters that fit on one line */
  charsPerLine: number;
  /** height of one ruled line in px (the page is maxLines of these) */
  lineH?: number;
}

export const DEFAULT_BUDGET: PageBudget = { maxLines: 22, charsPerLine: 44 };

const CODE_LANGS = new Set(["", "js", "javascript", "ts", "typescript", "python", "py", "c", "cpp", "c++", "java", "bash", "sh", "shell", "json", "html", "css", "sql", "text", "txt", "arduino", "ino", "rust", "go"]);
const SAFETY = 1.06;

/** Text length as the reader sees it: no link targets, emphasis marks or code ticks. */
export function plainLength(md: string): number {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/\$([^$]+)\$/g, (_m, g: string) => "x".repeat(Math.ceil(g.length * 0.8)))
    .replace(/\s+/g, " ")
    .trim().length;
}

const wrap = (len: number, cpl: number) => Math.max(1, Math.ceil(len / Math.max(8, cpl)));
const isTable = (lines: string[]) => lines.length >= 2 && /^\s*\|/.test(lines[0]) && /^\s*\|?\s*:?-{2,}/.test(lines[1]);
const isListLine = (l: string) => /^\s*([-*+]|\d+[.)])\s+/.test(l);

/** Lines one atomic block (paragraph, list, table, heading, math, fence) takes on a page. */
export function blockLines(block: string, cpl: number): number {
  const lines = block.replace(/\r\n/g, "\n").split("\n");
  const first = lines[0].trim();
  let n: number;
  if (/^(```|~~~)/.test(first)) {
    const lang = first.replace(/^(```|~~~)\s*/, "").split(/\s+/)[0].toLowerCase();
    // a picture, a quick check or an animated scene is a tall widget, not text
    n = CODE_LANGS.has(lang) ? Math.max(1, lines.length - 2) + 1.6 : 10;
  } else if (first === "$$" || /^\$\$/.test(first)) {
    n = 2.8 + (block.match(/\\\\/g) || []).length * 1.1;
  } else if (/^#{1,6}\s/.test(first)) {
    const level = (/^#+/.exec(first)?.[0].length ?? 3);
    n = (level <= 2 ? 2.8 : level === 3 ? 2.4 : 1.9) + (wrap(plainLength(first.replace(/^#+\s*/, "")), cpl * 0.8) - 1);
  } else if (isTable(lines)) {
    n = (lines.length - 1) * 1.55 + 0.9;
  } else if (isListLine(first)) {
    n = 0.9;
    for (const l of lines) if (isListLine(l)) n += wrap(plainLength(l.replace(/^\s*([-*+]|\d+[.)])\s+/, "")), cpl - 4) + 0.35;
    else n += wrap(plainLength(l), cpl - 4) - 0.35;
  } else if (/^>/.test(first)) {
    n = wrap(plainLength(block.replace(/^>\s?/gm, "")), cpl - 5) + 1.9;
  } else if (/^!\[/.test(first)) {
    n = 8;
  } else {
    n = wrap(plainLength(block), cpl) + 0.55;
  }
  return n * SAFETY;
}

/** Lines a whole run of text takes (blocks separated by blank lines). */
export function textLines(text: string, cpl: number, split: (t: string) => string[]): number {
  return split(text).reduce((sum, b) => sum + blockLines(b, cpl), 0);
}

/**
 * A block longer than a whole page is cut so it can run across pages: a paragraph between sentences,
 * a list between items, a table between rows (each part keeps the header row). Anything else stays whole.
 */
export function splitOversize(block: string, maxLines: number, cpl: number): string[] {
  if (blockLines(block, cpl) <= maxLines) return [block];
  const lines = block.replace(/\r\n/g, "\n").split("\n");
  const first = lines[0].trim();
  const pack = (units: string[], join: string, head = ""): string[] => {
    const out: string[] = [];
    let cur: string[] = [];
    for (const u of units) {
      const next = [...cur, u];
      if (cur.length > 0 && blockLines(head + next.join(join), cpl) > maxLines) {
        out.push(head + cur.join(join));
        cur = [u];
      } else cur = next;
    }
    if (cur.length) out.push(head + cur.join(join));
    return out;
  };
  if (isTable(lines)) return pack(lines.slice(2), "\n", `${lines[0]}\n${lines[1]}\n`);
  if (isListLine(first)) {
    const items: string[] = [];
    for (const l of lines) {
      if (isListLine(l) || items.length === 0) items.push(l);
      else items[items.length - 1] += `\n${l}`;
    }
    return pack(items, "\n");
  }
  if (/^(```|~~~|\$\$|#|>|!\[)/.test(first)) return [block];
  const sentences = block.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(\[])/);
  return sentences.length > 1 ? pack(sentences, " ") : [block];
}

/** A printed page has the same number of lines wherever it is read: 24 on a phone, more on bigger screens. */
export const PAGE_LINES = { phone: 24, tablet: 28, desktop: 32 } as const;

/**
 * The page's lines and characters per line, from the screen width and the text size. The line count does not depend on the window
 * height (so an address bar or keyboard never re-pages the book); bigger text means fewer lines on the same sheet.
 */
export function budgetFor(width: number, _height?: number, scale = 1): PageBudget {
  const w = Math.max(280, width);
  const phone = w < 640;
  const s = Math.min(1.6, Math.max(0.85, scale));
  const fontPx = (phone ? 15.5 : 16.6) * s;
  const lineH = Math.round(fontPx * 1.8);
  const pageW = Math.min(w - 32, 768) - (phone ? 64 : 112);
  const charsPerLine = Math.max(22, Math.floor(pageW / (fontPx * 0.5)));
  const base = phone ? PAGE_LINES.phone : w < 1024 ? PAGE_LINES.tablet : PAGE_LINES.desktop;
  const maxLines = Math.max(12, Math.round(base / Math.max(1, s)));
  return { maxLines, charsPerLine, lineH };
}
