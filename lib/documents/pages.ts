/** Pure helpers for reading documents page by page (text layer first, AI vision for scans and photos). */

/** Fewer real characters than this on a page means it is a scan, a photo or a drawing, not typed text. */
export const MIN_TEXT_CHARS = 40;
/** Pages sent to the vision model in one request. */
export const VISION_BATCH = 3;
/** Most pages one upload may send to vision, so a 400-page scan can't drain the AI allowance. */
export const MAX_VISION_PAGES = 60;

export function pageNeedsVision(pageText: string): boolean {
  const letters = (pageText || "").replace(/[\s\d\p{P}\p{S}]/gu, "");
  return letters.length < MIN_TEXT_CHARS;
}

export interface ReadPage {
  page: number;
  text: string;
  source: "text" | "vision" | "unreadable";
}

export function mergePages(pages: ReadPage[]): string {
  return [...pages]
    .sort((a, b) => a.page - b.page)
    .filter((p) => p.source !== "unreadable" && p.text.trim())
    .map((p) => `[Page ${p.page}]\n${p.text.trim()}`)
    .join("\n\n");
}

/** What the vision model is asked to do for each batch of page images. */
export const READ_SYSTEM = `You are a careful document reader. You are shown photos or scans of study material: typed pages, handwritten notes, textbook pages, whiteboards, slides.
For EACH image, in order, transcribe everything a student would need:
- Write the text exactly as it appears, keeping headings, lists and order. Do not summarise and do not add anything that is not there.
- Write every formula and equation as LaTeX between single dollar signs, for example $a^2 + b^2 = c^2$.
- Write tables as markdown tables.
- For a diagram, graph or picture, write one line: [Figure: what it shows, with any labels and values].
- If handwriting is unclear, give your best reading; write [unclear] only where nothing can be made out.
- If an image has no study content at all, write [blank page].
Start each image with a line exactly like "=== PAGE 1 ===" (1 for the first image in this request, 2 for the second, and so on). Output nothing else.`;

/** Splits the model's "=== PAGE n ===" answer back into one text per image. Always returns `count` entries. */
export function splitVisionAnswer(answer: string, count: number): string[] {
  const out: string[] = Array.from({ length: count }, () => "");
  const parts = (answer || "").split(/^=+\s*PAGE\s+(\d+)\s*=+\s*$/im);
  if (parts.length < 3) {
    // the model skipped the markers: with one image the whole answer is that page
    if (count === 1) out[0] = (answer || "").trim();
    return out;
  }
  for (let i = 1; i < parts.length; i += 2) {
    const idx = Number(parts[i]) - 1;
    if (idx >= 0 && idx < count) out[idx] = (parts[i + 1] || "").trim();
  }
  return out;
}

export function cleanVisionText(text: string): string {
  const t = (text || "").trim();
  return /^\[blank page\]$/i.test(t) ? "" : t;
}
