import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { FILES } from "@/lib/library/server";
import { getFile } from "@/lib/library/storage";
import { extractChapterPdf, type ChapterIndex } from "@/lib/library/book-index";

export const runtime = "nodejs";

/**
 * Downloads or views a single extracted chapter from a textbook or long document.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; chapterNum: string }> }
) {
  try {
    await requireUser(req);
    const { id, chapterNum } = await params;
    const num = parseInt(chapterNum, 10);
    if (Number.isNaN(num) || num < 1) {
      throw new ApiError(400, "VALIDATION", "Invalid chapter number.");
    }

    const snap = await FILES().doc(id).get();
    if (!snap.exists) {
      throw new ApiError(404, "NOT_FOUND", "File not found.");
    }

    const doc = snap.data() || {};
    const chapters: ChapterIndex[] = Array.isArray(doc.chapters) ? doc.chapters : [];
    const chapter = chapters.find((c) => c.chapterNumber === num);

    if (!chapter) {
      throw new ApiError(404, "NOT_FOUND", `Chapter ${num} not found in this document.`);
    }

    const parentBytes = await getFile(doc.id, doc.where);
    if (!parentBytes) {
      throw new ApiError(404, "STORAGE_FILE_MISSING", "Original document file is unavailable.");
    }

    const chapterBytes = await extractChapterPdf(
      parentBytes,
      chapter.startPage,
      chapter.endPage
    );

    const safeTitle = (doc.title || "Book").replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `${safeTitle}_Chapter_${chapter.chapterNumber}.pdf`;

    return new NextResponse(new Uint8Array(chapterBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(chapterBytes.length),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
