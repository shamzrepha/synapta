import crypto from "crypto";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { analyzeMaterialAndRoute, MapProposal } from "./materialRouter";
import { sanitizeUntrustedPromptText } from "@/lib/ai/scrub";
import { AiQuotaExhaustedError, createCallBudget } from "@/lib/ai/router";

export interface DocumentSkeleton {
  title: string;
  totalPages: number;
  isScanned: boolean;
  chapters: Array<{
    title: string;
    pageNumber: number;
    snippet: string;
  }>;
  textSnippet: string;
}

export interface IngestionResult {
  materialId: string;
  contentHash: string;
  skeleton: DocumentSkeleton;
  proposal?: MapProposal;
  status: "analyzed" | "waiting_quota" | "error";
  resumeAt?: string;
  error?: string;
}

/**
 * Parses a PDF buffer using pdfjs-dist legacy build to extract page text,
 * outline bookmarks, and evaluate if it is a scanned document.
 */
export async function parsePdfBuffer(buffer: Buffer): Promise<{
  totalPages: number;
  pages: string[];
  outline: Array<{ title: string; pageNumber: number }>;
  isScanned: boolean;
}> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
    });

    const doc = await loadingTask.promise;
    const totalPages = doc.numPages;

    const maxPagesToRead = Math.min(totalPages, 150);
    const pages: string[] = [];
    let totalChars = 0;

    for (let i = 1; i <= maxPagesToRead; i++) {
      try {
        const page = await doc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((item: any) => ("str" in item ? String(item.str) : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        pages.push(pageText);
        totalChars += pageText.length;
      } catch {
        pages.push("");
      }
    }

    // Scanned detection: fewer than 40 chars average per page
    const avgCharsPerPage = pages.length > 0 ? totalChars / pages.length : 0;
    const isScanned = avgCharsPerPage < 40;

    // Extract Outline/Bookmarks if available
    const outline: Array<{ title: string; pageNumber: number }> = [];
    try {
      const rawOutline = await doc.getOutline();
      if (Array.isArray(rawOutline)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const traverse = (items: any[]) => {
          for (const item of items) {
            if (item && item.title) {
              outline.push({
                title: String(item.title).trim(),
                pageNumber: 1, // default
              });
            }
            if (Array.isArray(item.items)) {
              traverse(item.items);
            }
          }
        };
        traverse(rawOutline);
      }
    } catch {
      // Outline not present or encrypted
    }

    return {
      totalPages,
      pages,
      outline,
      isScanned,
    };
  } catch (err) {
    console.warn("[materialIngest] Failed to parse PDF with pdfjs-dist:", err);
    return {
      totalPages: 1,
      pages: [buffer.toString("utf8", 0, Math.min(buffer.length, 10000))],
      outline: [],
      isScanned: false,
    };
  }
}

/**
 * Builds a call-minimizing document skeleton:
 * Caps content to at most 15 chapter landmarks with 300-500 char previews.
 */
export function buildDocumentSkeleton(
  title: string,
  parsed: {
    totalPages: number;
    pages: string[];
    outline: Array<{ title: string; pageNumber: number }>;
    isScanned: boolean;
  }
): DocumentSkeleton {
  const { totalPages, pages, outline, isScanned } = parsed;
  const chapters: Array<{ title: string; pageNumber: number; snippet: string }> = [];

  // 1. If bookmarks/outline exist, prioritize them
  if (outline.length > 0) {
    const selected = outline.slice(0, 15);
    for (let i = 0; i < selected.length; i++) {
      const item = selected[i];
      const pageIdx = Math.min(Math.floor((i / selected.length) * pages.length), pages.length - 1);
      const text = pages[pageIdx] || "";
      chapters.push({
        title: item.title,
        pageNumber: pageIdx + 1,
        snippet: text.slice(0, 400),
      });
    }
  } else {
    // 2. Scan text for Chapter/Unit patterns
    const chapterRegex = /(?:Chapter|Unit|Module|Section|Topic)\s+\d+[:\s\.\-]+[^\n]+/gi;
    const foundMatches: Array<{ title: string; pageIndex: number; snippet: string }> = [];

    for (let pIdx = 0; pIdx < pages.length; pIdx++) {
      const pText = pages[pIdx];
      const match = chapterRegex.exec(pText);
      if (match) {
        foundMatches.push({
          title: match[0].trim().slice(0, 60),
          pageIndex: pIdx,
          snippet: pText.slice(0, 400),
        });
      }
      if (foundMatches.length >= 15) break;
    }

    if (foundMatches.length >= 3) {
      for (const m of foundMatches) {
        chapters.push({
          title: m.title,
          pageNumber: m.pageIndex + 1,
          snippet: m.snippet,
        });
      }
    } else {
      // 3. Fallback: even distribution of landmarks across document
      const step = Math.max(1, Math.floor(pages.length / Math.min(10, Math.max(1, pages.length))));
      for (let pIdx = 0; pIdx < pages.length; pIdx += step) {
        const text = pages[pIdx] || "";
        if (text.length > 0) {
          chapters.push({
            title: `Part ${chapters.length + 1} (Page ${pIdx + 1})`,
            pageNumber: pIdx + 1,
            snippet: text.slice(0, 400),
          });
        }
        if (chapters.length >= 12) break;
      }
    }
  }

  const combinedSnippet = chapters.map((c) => `### ${c.title}\n${c.snippet}`).join("\n\n");

  return {
    title,
    totalPages,
    isScanned,
    chapters,
    textSnippet: combinedSnippet || pages.slice(0, 3).join("\n\n").slice(0, 3000),
  };
}

/**
 * Ingests a material buffer directly from Firebase Storage or memory,
 * constructs a compact skeleton, runs route proposal generation, and records state.
 */
export async function ingestMaterialBuffer({
  classId,
  materialId,
  title,
  fileName,
  mime,
  buffer,
  userId,
}: {
  classId: string;
  materialId: string;
  title: string;
  fileName: string;
  mime: string;
  buffer: Buffer;
  userId?: string;
}): Promise<IngestionResult> {
  const contentHash = crypto.createHash("sha256").update(buffer).digest("hex");
  const materialRef = adminDb()
    .collection("classes")
    .doc(classId)
    .collection("materials")
    .doc(materialId);

  // 1. Parse text & outline
  let skeleton: DocumentSkeleton;
  let libraryText = "";
  if ((mime === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) && mime !== "text/plain") {
    const parsedPdf = await parsePdfBuffer(buffer);
    skeleton = buildDocumentSkeleton(title, parsedPdf);
    libraryText = parsedPdf.pages
      .map((p, i) => `[Page ${i + 1}] ${p}`)
      .join("\n")
      .slice(0, 150000);
  } else {
    // Plain text or markdown
    const rawText = buffer.toString("utf8");
    libraryText = rawText.slice(0, 150000);
    const clean = sanitizeUntrustedPromptText(rawText, 15000);
    skeleton = {
      title,
      totalPages: 1,
      isScanned: false,
      chapters: [{ title, pageNumber: 1, snippet: clean.slice(0, 1000) }],
      textSnippet: clean,
    };
  }

  // Update material doc with extracted skeleton metrics + library text (document library DB)
  await materialRef.set(
    {
      contentHash,
      status: "processing",
      totalPages: skeleton.totalPages,
      isScanned: skeleton.isScanned,
      chapterCount: skeleton.chapters.length,
      chapters: skeleton.chapters.map((c) => ({ title: c.title, pageNumber: c.pageNumber })),
      extractedText: libraryText,
      extractedChars: libraryText.length,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );

  // 2. Budget Guard: max 2 calls for material ingestion
  createCallBudget("material_upload", skeleton.totalPages);

  // 3. Generate Map Proposals via Material Router
  try {
    const proposal = await analyzeMaterialAndRoute({
      classId,
      materialId,
      materialTitle: title,
      extractedText: skeleton.textSnippet,
      userId,
    });

    await materialRef.set(
      {
        status: "analyzed",
        proposalId: proposal.id,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );

    return {
      materialId,
      contentHash,
      skeleton,
      proposal,
      status: "analyzed",
    };
  } catch (err: unknown) {
    if (err instanceof AiQuotaExhaustedError) {
      console.warn(`[materialIngest] Daily quota exhausted for material ${materialId}. Pausing job until ${err.resumeAt}.`);

      // Store resumable job in materialJobs collection
      const jobRef = adminDb()
        .collection("classes")
        .doc(classId)
        .collection("materialJobs")
        .doc(materialId);

      await jobRef.set({
        id: materialId,
        materialId,
        classId,
        status: "waiting_quota",
        resumeAt: err.resumeAt,
        resumeTimestampMs: err.resumeTimestampMs,
        title,
        extractedText: skeleton.textSnippet,
        updatedAt: Timestamp.now(),
      });

      await materialRef.set(
        {
          status: "waiting_quota",
          resumeAt: err.resumeAt,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

      return {
        materialId,
        contentHash,
        skeleton,
        status: "waiting_quota",
        resumeAt: err.resumeAt,
      };
    }

    const errorMsg = err instanceof Error ? err.message : String(err);
    await materialRef.set(
      {
        status: "error",
        error: errorMsg,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );

    return {
      materialId,
      contentHash,
      skeleton,
      status: "error",
      error: errorMsg,
    };
  }
}
