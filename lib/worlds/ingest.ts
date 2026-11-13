import { z } from "zod";
import { generateStructured } from "@/lib/ai/structured/generate";
import { cleanLines, textToRawLines, type CleanLine, type RawLine } from "./clean";
import { col, now, saveDocPages } from "./store";

export const MAX_TEXT_CHARS = 400_000;
export const MAX_IMAGES = 14;

const ocrSchema = z.object({ lines: z.array(z.object({ text: z.string(), confidence: z.number().min(0).max(1) })).max(400) });

export interface IngestInput {
  ownerUid: string;
  classId?: string | null;
  /** the class library material this note was taken from (so it is never read twice) */
  materialId?: string | null;
  title: string;
  kind: "docx" | "pdf" | "image" | "text";
  /** one string per page when the browser could tell pages apart, else a single string */
  pageTexts?: string[];
  images?: Array<{ mime: string; dataBase64: string }>;
}

export interface IngestResult {
  docId: string;
  pageCount: number;
  flagged: Array<{ pageNo: number; lineNo: number; text: string; reason: string }>;
  repairs: number;
}

/** Reads a handwritten or scanned page with the vision model, returning lines with a confidence for each. */
export async function ocrPage(pageNo: number, image: { mime: string; dataBase64: string }): Promise<RawLine[]> {
  const r = await generateStructured({ task: "ingest_vision", promptName: "ocr_page", promptVars: { page_no: String(pageNo) }, schema: ocrSchema, images: [image], temperature: 0.1, maxTokens: 3000 });
  return r.data.lines;
}

/**
 * Spec S0: get text (from the browser's reader or the vision model), clean it by rules, flag what is unclear, and store it
 * page by page. Nothing is silently fixed; the student confirms flagged lines in Review Gate 1.
 */
export async function ingestDocument(input: IngestInput): Promise<IngestResult> {
  const rawPages: RawLine[][] = [];
  if (input.images?.length) {
    for (let i = 0; i < input.images.length; i++) rawPages.push(await ocrPage(i + 1, input.images[i]));
  } else {
    for (const t of input.pageTexts ?? []) rawPages.push(textToRawLines(t));
  }
  const pages: Array<{ pageNo: number; lines: CleanLine[] }> = [];
  let repairs = 0;
  rawPages.forEach((raw, i) => {
    const { lines, repairs: r } = cleanLines(raw);
    repairs += r.length;
    if (lines.length) pages.push({ pageNo: i + 1, lines });
  });
  const ref = col.sourceDocs().doc();
  const flagged = pages.flatMap((p) => p.lines.filter((l) => l.flagged).map((l) => ({ pageNo: p.pageNo, lineNo: l.lineNo, text: l.text, reason: l.flagReason ?? "Please check this line." })));
  await saveDocPages(ref.id, pages);
  await ref.set({ ownerUid: input.ownerUid, classId: input.classId ?? null, materialId: input.materialId ?? null, title: input.title.slice(0, 120), kind: input.kind, status: flagged.length ? "cleaned" : "reviewed", pageCount: pages.length, flaggedCount: flagged.length, repairCount: repairs, createdAt: now() });
  return { docId: ref.id, pageCount: pages.length, flagged, repairs };
}
