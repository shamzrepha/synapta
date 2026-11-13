/**
 * Notes that are already in a class's subject library never have to be uploaded again: a world can be built straight from
 * them. The library keeps each material's text in one string, with a "[Page N]" marker before each page of a PDF.
 */
export function splitLibraryText(text: string): string[] {
  const t = (text || "").replace(/\r\n/g, "\n").trim();
  if (!t) return [];
  if (/\[Page \d+\]/.test(t)) {
    const pages = t.split(/\[Page \d+\]\s*/).map((p) => p.trim()).filter((p) => p.length > 0);
    if (pages.length) return pages;
  }
  // slides and Word files come through as one block: split on form feeds when there are any
  const ff = t.split("\f").map((p) => p.trim()).filter(Boolean);
  return ff.length ? ff : [t];
}

export interface LibraryMaterialRow {
  id: string;
  title: string;
  fileName: string;
  /** characters of readable text */
  chars: number;
  pages: number;
  /** why it can't be used yet, in plain words */
  problem: string | null;
  /** the note already made from it, if any */
  docId: string | null;
}

/** What the picker shows for one library material (never the text itself: it can be very long). */
export function describeMaterial(id: string, m: { title?: unknown; fileName?: unknown; extractedText?: unknown; status?: unknown; isScanned?: unknown }, docId: string | null): LibraryMaterialRow {
  const text = typeof m.extractedText === "string" ? m.extractedText : "";
  const pages = splitLibraryText(text);
  const chars = pages.reduce((n, p) => n + p.length, 0);
  let problem: string | null = null;
  if (m.status === "processing") problem = "Still being read. Try again in a minute.";
  else if (chars < 40) problem = m.isScanned ? "This is a scan with no readable text. Add photos of the pages instead." : "No readable text found.";
  const title = String(m.title || m.fileName || "Untitled").slice(0, 120);
  return { id, title, fileName: String(m.fileName || ""), chars, pages: pages.length, problem, docId };
}
