import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { parsePdfBuffer, buildDocumentSkeleton } from "./materialIngest";

describe("lib/teacher/materialIngest (Fix Pack C4 & C5)", () => {
  it("extracts text and page counts from real generated PDF buffers", async () => {
    // Generate valid sample PDF using pdf-lib
    const pdfDoc = await PDFDocument.create();
    const page1 = pdfDoc.addPage([600, 400]);
    page1.drawText("Chapter 1: Nyquist Stability Criteria and Gain Margin Analysis", { x: 50, y: 350 });

    const page2 = pdfDoc.addPage([600, 400]);
    page2.drawText("Chapter 2: Bode Plots and Phase Margins for High-Performance Servo Systems", { x: 50, y: 350 });

    const bytes = await pdfDoc.save();
    const buffer = Buffer.from(bytes);

    const parsed = await parsePdfBuffer(buffer);
    expect(parsed.totalPages).toBe(2);
    expect(parsed.pages).toHaveLength(2);
    expect(parsed.pages[0]).toContain("Nyquist Stability");
    expect(parsed.pages[1]).toContain("Bode Plots");
    expect(parsed.isScanned).toBe(false);
  });

  it("detects scanned PDF documents with low character density (< 40 chars/page)", async () => {
    // Generate empty pages with barely any text
    const pdfDoc = await PDFDocument.create();
    const p1 = pdfDoc.addPage([600, 400]);
    p1.drawText("A", { x: 50, y: 50 }); // 1 character
    const p2 = pdfDoc.addPage([600, 400]);
    p2.drawText("B", { x: 50, y: 50 }); // 1 character

    const bytes = await pdfDoc.save();
    const buffer = Buffer.from(bytes);

    const parsed = await parsePdfBuffer(buffer);
    expect(parsed.totalPages).toBe(2);
    expect(parsed.isScanned).toBe(true);
  });

  it("builds a call-minimizing document skeleton capped at 15 chapter landmarks", () => {
    const pages = Array.from({ length: 40 }, (_, i) => `Chapter ${i + 1}: Topic description with deep mathematical details for engineering students.`);

    const skeleton = buildDocumentSkeleton("Control Systems Textbook", {
      totalPages: 40,
      pages,
      outline: [],
      isScanned: false,
    });

    expect(skeleton.totalPages).toBe(40);
    expect(skeleton.chapters.length).toBeLessThanOrEqual(15);
    expect(skeleton.chapters.length).toBeGreaterThanOrEqual(1);
    expect(skeleton.textSnippet).toContain("Chapter 1");
    // Verify snippets are compact
    skeleton.chapters.forEach((c) => {
      expect(c.snippet.length).toBeLessThanOrEqual(400);
    });
  });
});
