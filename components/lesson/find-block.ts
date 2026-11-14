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

/** The smallest block on the page that holds the paragraph (a paragraph, list item, table cell, quote or callout box), or null. */
export function findBlockElement(root: Element, blockMarkdown: string): HTMLElement | null {
  const wantLen = alnum(plainBlock(blockMarkdown)).length;
  const limit = Math.max(wantLen * 3 + 400, 600);
  let best: HTMLElement | null = null;
  let bestLen = Infinity;
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("p, li, td, th, blockquote, dd, dt, figcaption, div, section"))) {
    const text = el.textContent || "";
    if (text.length > limit || !textHasBlock(text, blockMarkdown)) continue;
    // a later element of the same length is inside the earlier one: prefer the inner
    if (text.length <= bestLen) {
      best = el;
      bestLen = text.length;
    }
  }
  return best;
}

/** Which of several pages (their markdown) holds the paragraph; -1 when none does. */
export function pageHolding(pagesMarkdown: string[], blockMarkdown: string): number {
  const want = alnum(plainBlock(blockMarkdown)).slice(0, PREFIX);
  if (want.length < 4) return -1;
  return pagesMarkdown.findIndex((p) => alnum(plainBlock(p)).includes(want));
}
