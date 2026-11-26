import { describe, it, expect, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  splitPageRanges,
  classifyChaptersWithSpendCap,
  extractChapterPdf,
  MAX_AI_CHAPTER_CALLS_PER_FILE,
} from "./book-index";

describe("Book and Long Document Indexing", () => {
  describe("splitPageRanges", () => {
    it("splits document based on outline entries", () => {
      const outlines = [
        { title: "Introduction to Dynamics (MCE 201)", startPage: 1 },
        { title: "Kinematics of Particles", startPage: 25 },
        { title: "Kinetics of Systems (MCE 202)", startPage: 60 },
        { title: "Vibrations and Resonance", startPage: 110 },
      ];

      const chapters = splitPageRanges(150, outlines);

      expect(chapters).toHaveLength(4);
      expect(chapters[0]).toMatchObject({
        chapterNumber: 1,
        title: "Introduction to Dynamics (MCE 201)",
        startPage: 1,
        endPage: 24,
        pageCount: 24,
        courseCode: "MCE 201",
      });
      expect(chapters[1]).toMatchObject({
        chapterNumber: 2,
        title: "Kinematics of Particles",
        startPage: 25,
        endPage: 59,
        pageCount: 35,
      });
      expect(chapters[2]).toMatchObject({
        chapterNumber: 3,
        startPage: 60,
        endPage: 109,
        pageCount: 50,
        courseCode: "MCE 202",
      });
      expect(chapters[3]).toMatchObject({
        chapterNumber: 4,
        startPage: 110,
        endPage: 150,
        pageCount: 41,
      });
    });

    it("falls back to sequential chunking when no outlines are present", () => {
      const chapters = splitPageRanges(200);

      expect(chapters.length).toBeGreaterThan(0);
      expect(chapters[0].startPage).toBe(1);
      expect(chapters[chapters.length - 1].endPage).toBe(200);

      // Verify contiguous non-overlapping coverage
      for (let i = 0; i < chapters.length - 1; i++) {
        expect(chapters[i + 1].startPage).toBe(chapters[i].endPage + 1);
      }
    });

    it("returns empty array for 0 or negative pages", () => {
      expect(splitPageRanges(0)).toEqual([]);
      expect(splitPageRanges(-5)).toEqual([]);
    });
  });

  describe("classifyChaptersWithSpendCap", () => {
    it("enforces AI spend cap per file and logs spend", async () => {
      const mockChapters = Array.from({ length: 12 }, (_, i) => ({
        chapterNumber: i + 1,
        title: `Chapter ${i + 1}: General Engineering`,
        startPage: i * 20 + 1,
        endPage: (i + 1) * 20,
        pageCount: 20,
        courseCode: null,
      }));

      const mockAiCaller = vi.fn().mockImplementation(async () => {
        return "ENG 101";
      });

      const { chapters, spendLogs, totalCalls, capReached } =
        await classifyChaptersWithSpendCap(
          "file-123",
          mockChapters,
          {},
          {
            maxCalls: MAX_AI_CHAPTER_CALLS_PER_FILE, // 5
            aiCaller: mockAiCaller,
          }
        );

      // Total calls must strictly not exceed maxCalls (5)
      expect(totalCalls).toBe(5);
      expect(mockAiCaller).toHaveBeenCalledTimes(5);
      expect(capReached).toBe(true);

      // First 5 chapters got classified by AI
      for (let i = 0; i < 5; i++) {
        expect(chapters[i].courseCode).toBe("ENG 101");
      }

      // Remaining chapters skipped AI call due to spend cap
      for (let i = 5; i < 12; i++) {
        expect(chapters[i].courseCode).toBeNull();
      }

      // Spend logs should record the calls and the cap notice
      expect(spendLogs.length).toBeGreaterThanOrEqual(5);
      const capLog = spendLogs.find((l) => l.note?.includes("Spend cap reached"));
      expect(capLog).toBeDefined();
    });
  });

  describe("extractChapterPdf", () => {
    it("extracts a single chapter page range from a PDF buffer", async () => {
      // Create a test 6-page PDF
      const doc = await PDFDocument.create();
      for (let i = 1; i <= 6; i++) {
        const page = doc.addPage([200, 200]);
        // dummy content
        page.drawText(`Page ${i}`);
      }
      const fullPdfBytes = Buffer.from(await doc.save());

      // Extract Chapter 2 (pages 3 to 4)
      const chapterBytes = await extractChapterPdf(fullPdfBytes, 3, 4);
      expect(chapterBytes).toBeInstanceOf(Buffer);

      // Verify the resulting sub-PDF has exactly 2 pages
      const extractedDoc = await PDFDocument.load(chapterBytes);
      expect(extractedDoc.getPageCount()).toBe(2);
    });
  });
});
