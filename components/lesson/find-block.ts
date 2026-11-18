/** Letters and digits only, lower case: the same paragraph compares equal however its markdown or inline pieces were drawn. */
export const alnum = (s: string): string => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** A paragraph's markdown without its links' addresses, images and markers, so only the words are left. */
export function plainBlock(md: string): string {
  return String(md || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** How many letters of the start of a paragraph are compared. Long enough to be unique, short enough to survive inline maths. */
const PREFIX = 26;

/** True when the element's text begins with, or contains near its start, the same words as the paragraph. */
export function textHasBlock(elementText: string, blockMarkdown: string): boolean {
  const want = alnum(plainBlock(blockMarkdown)).slice(0, PREFIX);
  if (want.length < 4) return false;
  return alnum(elementText).includes(want);
}

const BLOCK_SELECTOR =
  "h1, h2, h3, h4, h5, h6, [data-read-heading], p, li, td, th, blockquote, dd, dt, figcaption, div, section";

/** The smallest block on the page that holds the paragraph or heading, or null. */
export function findBlockElement(root: Element, blockMarkdown: string): HTMLElement | null {
  const wantLen = alnum(plainBlock(blockMarkdown)).length;
  const limit = Math.max(wantLen * 3 + 400, 600);
  const scan = (): HTMLElement | null => {
    let best: HTMLElement | null = null;
    let bestLen = Infinity;
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR))) {
      const text = el.textContent || "";
      if (text.length > limit || !textHasBlock(text, blockMarkdown)) continue;
      // a later element of the same length is inside the earlier one: prefer the inner
      if (text.length <= bestLen) {
        best = el;
        bestLen = text.length;
      }
    }
    return best;
  };
  const found = scan();
  if (found) return found;
  return null;
}

/** Which of several pages (their markdown) holds the paragraph; -1 when none does. */
export function pageHolding(pagesMarkdown: string[], blockMarkdown: string, from = 0, wrap = true): number {
  const want = alnum(plainBlock(blockMarkdown)).slice(0, PREFIX);
  if (want.length < 4) return -1;
  const has = (p: string) => alnum(plainBlock(p)).includes(want);
  const start = Math.min(Math.max(0, from), pagesMarkdown.length);
  // the voice reads forward from the page on screen: look there first, so a title or heading that every page repeats never sends it back to page 1
  for (let i = start; i < pagesMarkdown.length; i++) if (has(pagesMarkdown[i])) return i;
  if (!wrap) return -1;
  for (let i = 0; i < start; i++) if (has(pagesMarkdown[i])) return i;
  return -1;
}

/** Returns the bounding box of the very first visible word inside `el` (or `el`'s own box). */
export function firstWordBox(el: HTMLElement): DOMRect {
  if (typeof document !== "undefined") {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || p.closest(".katex-mathml, script, style, button:not(.note-term), [aria-hidden='true']")) {
          return NodeFilter.FILTER_REJECT;
        }
        return n.nodeValue && /[\p{L}\p{N}]/u.test(n.nodeValue)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    const firstNode = walker.nextNode() as Text | null;
    if (firstNode && firstNode.nodeValue) {
      const m = /[\p{L}\p{N}]+/u.exec(firstNode.nodeValue);
      if (m) {
        const range = document.createRange();
        range.setStart(firstNode, m.index);
        range.setEnd(firstNode, m.index + m[0].length);
        const r = range.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return r;
      }
    }
  }
  return el.getBoundingClientRect();
}
