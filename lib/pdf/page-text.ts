/**
 * The text of one PDF page, read WITHOUT pdf.js's own `page.getTextContent()`.
 *
 * Why: in pdf.js 6 `getTextContent()` loops over a stream with `for await (const value of stream)`. iPhone Safari (and so every browser on
 * iOS) can't loop over a ReadableStream that way, and the first page of every PDF failed with "undefined is not a function (near '...of e...')".
 * Reading the same stream with `getReader().read()` works everywhere and needs no polyfill.
 */
export interface TextPage {
  streamTextContent?: (params?: Record<string, unknown>) => ReadableStream<{ items: unknown[] }>;
  getTextContent: (params?: Record<string, unknown>) => Promise<{ items: unknown[] }>;
}

const strOf = (it: unknown): string => (it && typeof it === "object" && "str" in it && typeof (it as { str: unknown }).str === "string" ? (it as { str: string }).str : "");

export async function pageText(page: TextPage): Promise<string> {
  if (typeof page.streamTextContent !== "function") {
    const content = await page.getTextContent();
    return content.items.map(strOf).join(" ");
  }
  const reader = page.streamTextContent().getReader();
  const parts: string[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const it of value?.items ?? []) parts.push(strOf(it));
    }
  } finally {
    reader.releaseLock?.();
  }
  return parts.join(" ");
}

/** A short, plain message for an error a browser throws deep inside a library, so nobody sees "undefined is not a function". */
export function friendlyReadError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err ?? "");
  // our own messages are already written for people
  if (err instanceof Error && !(err instanceof TypeError) && !/is not a function|is undefined|is not defined|undefined|cannot read|null/i.test(message)) return err;
  if (/DecompressionStream/i.test(message)) return new Error("This phone's browser can't open Word or PowerPoint files. Save the file as a PDF and upload that.");
  return new Error("Couldn't read that file on this browser. Try a PDF or a clear photo, or update your browser and try again.");
}
