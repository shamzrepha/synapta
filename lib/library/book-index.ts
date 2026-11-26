import { PDFDocument } from "pdf-lib";
import { generateWithFallback } from "@/lib/ai/router";
import { fenceUntrusted } from "@/lib/ai/generate";
import { z } from "zod";

export interface ChapterIndex {
  chapterNumber: number;
  title: string;
  startPage: number; // 1-indexed
  endPage: number;   // 1-indexed (inclusive)
  pageCount: number;
  courseCode: string | null;
}

export interface SpendLogEntry {
  fileId: string;
  chapterNumber: number;
  tokensUsed?: number;
  costEstimatedCents: number;
  timestamp: string;
  note?: string;
}

export const MAX_AI_CHAPTER_CALLS_PER_FILE = 5;
export const COST_PER_CALL_CENTS = 0.2; // 0.2 cents (~$0.002) per micro-call

const CODE_REGEX = /\b([A-Za-z]{2,4})[\s_-]?(\d{3})\b/;

/** Extract course code from text using regex heuristic */
export function extractCourseCodeHeuristic(text: string): string | null {
  const m = CODE_REGEX.exec(text);
  return m ? `${m[1].toUpperCase()} ${m[2]}` : null;
}

/**
 * Pure function: splits a document into structured chapter page ranges.
 * Ensures valid 1-indexed, non-overlapping, sequential ranges.
 */
export function splitPageRanges(
  totalPages: number,
  rawOutline?: Array<{ title: string; startPage?: number }>
): ChapterIndex[] {
  if (totalPages <= 0) return [];

  // Filter and normalize outline entries that have reasonable start pages
  const validOutlines = (rawOutline || [])
    .filter((o) => typeof o.startPage === "number" && o.startPage >= 1 && o.startPage <= totalPages)
    .sort((a, b) => (a.startPage! - b.startPage!));

  // If valid outlines exist, build chapters from them
  if (validOutlines.length > 0) {
    const chapters: ChapterIndex[] = [];
    for (let i = 0; i < validOutlines.length; i++) {
      const cur = validOutlines[i];
      const startPage = cur.startPage!;
      const next = validOutlines[i + 1];
      const endPage = next ? Math.min(totalPages, next.startPage! - 1) : totalPages;
      if (endPage >= startPage) {
        chapters.push({
          chapterNumber: chapters.length + 1,
          title: cur.title.trim() || `Chapter ${chapters.length + 1}`,
          startPage,
          endPage,
          pageCount: endPage - startPage + 1,
          courseCode: extractCourseCodeHeuristic(cur.title),
        });
      }
    }
    if (chapters.length > 0) return chapters;
  }

  // Fallback: chunk into chapters of ~25 pages (or at least 1 chapter)
  const chunkSize = Math.max(15, Math.min(30, Math.ceil(totalPages / 10)));
  const chapters: ChapterIndex[] = [];
  let currentStart = 1;

  while (currentStart <= totalPages) {
    const endPage = Math.min(totalPages, currentStart + chunkSize - 1);
    const chapterNum = chapters.length + 1;
    chapters.push({
      chapterNumber: chapterNum,
      title: `Chapter ${chapterNum}`,
      startPage: currentStart,
      endPage,
      pageCount: endPage - currentStart + 1,
      courseCode: null,
    });
    currentStart = endPage + 1;
  }

  return chapters;
}

const chapterAiSchema = z.object({
  courseCode: z.string().nullable(),
});

/**
 * Classifies chapters by course code with an enforced spend cap per file.
 * Reads ONLY the chapter title and the first page text snippet (never full text).
 * Logs all AI spend and stops calling AI once the spend cap is hit.
 */
export async function classifyChaptersWithSpendCap(
  fileId: string,
  chapters: ChapterIndex[],
  firstPageSnippets: Record<number, string>, // chapterNumber -> page 1 text snippet
  options?: {
    maxCalls?: number;
    userId?: string;
    aiCaller?: (title: string, snippet: string) => Promise<string | null>;
  }
): Promise<{
  chapters: ChapterIndex[];
  spendLogs: SpendLogEntry[];
  totalCalls: number;
  capReached: boolean;
}> {
  const maxCalls = options?.maxCalls ?? MAX_AI_CHAPTER_CALLS_PER_FILE;
  const spendLogs: SpendLogEntry[] = [];
  let callsMade = 0;
  let capReached = false;

  const resultChapters: ChapterIndex[] = [];

  for (const ch of chapters) {
    let resolvedCode = ch.courseCode;

    // Check if we already have a course code from title heuristic
    if (!resolvedCode) {
      if (callsMade < maxCalls) {
        callsMade++;
        const snippet = firstPageSnippets[ch.chapterNumber] || "";

        try {
          if (options?.aiCaller) {
            resolvedCode = await options.aiCaller(ch.title, snippet);
          } else {
            const aiRes = await generateWithFallback({
              task: "material_route",
              systemInstruction:
                "Identify the university course code (e.g. MCE 302, PHY 101, EEE 201) for this textbook chapter from its title and page 1 text. If unknown, return null. Return JSON only.",
              userPrompt: fenceUntrusted(
                `Chapter: ${ch.title}\nPage 1 text snippet: ${snippet.slice(0, 500)}`,
                "USER_INPUT"
              ),
              schema: chapterAiSchema,
              temperature: 0,
              userId: options?.userId,
            });
            resolvedCode = aiRes.data?.courseCode || null;
          }

          spendLogs.push({
            fileId,
            chapterNumber: ch.chapterNumber,
            costEstimatedCents: COST_PER_CALL_CENTS,
            timestamp: new Date().toISOString(),
            note: `Classified as ${resolvedCode || "none"}`,
          });
        } catch {
          spendLogs.push({
            fileId,
            chapterNumber: ch.chapterNumber,
            costEstimatedCents: 0,
            timestamp: new Date().toISOString(),
            note: "AI call failed; skipped",
          });
        }
      } else {
        if (!capReached) {
          capReached = true;
          spendLogs.push({
            fileId,
            chapterNumber: ch.chapterNumber,
            costEstimatedCents: 0,
            timestamp: new Date().toISOString(),
            note: `Spend cap reached (${maxCalls} calls). Remaining chapters skip AI.`,
          });
        }
      }
    }

    resultChapters.push({
      ...ch,
      courseCode: resolvedCode || null,
    });
  }

  return {
    chapters: resultChapters,
    spendLogs,
    totalCalls: callsMade,
    capReached,
  };
}

/**
 * Extracts a chapter's page range into a standalone PDF buffer using pdf-lib.
 */
export async function extractChapterPdf(
  pdfBytes: Buffer,
  startPage: number,
  endPage: number
): Promise<Buffer> {
  const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const subDoc = await PDFDocument.create();
  const pageCount = srcDoc.getPageCount();

  const pageIndices: number[] = [];
  for (let p = startPage - 1; p <= endPage - 1; p++) {
    if (p >= 0 && p < pageCount) {
      pageIndices.push(p);
    }
  }

  if (pageIndices.length === 0) {
    throw new Error(`Invalid page range: ${startPage}-${endPage} for PDF with ${pageCount} pages`);
  }

  const copiedPages = await subDoc.copyPages(srcDoc, pageIndices);
  for (const page of copiedPages) {
    subDoc.addPage(page);
  }

  const savedBytes = await subDoc.save();
  return Buffer.from(savedBytes);
}
