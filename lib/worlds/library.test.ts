import { describe, expect, it } from "vitest";
import { describeMaterial, splitLibraryText } from "./library";

describe("class library notes for worlds", () => {
  it("splits a PDF's text on its page markers", () => {
    expect(splitLibraryText("[Page 1] Heart\nfour chambers\n[Page 2] Lungs\ngas exchange")).toEqual(["Heart\nfour chambers", "Lungs\ngas exchange"]);
  });

  it("keeps plain text as one page, or splits on form feeds", () => {
    expect(splitLibraryText("Just some notes about cells")).toEqual(["Just some notes about cells"]);
    expect(splitLibraryText("slide one\fslide two")).toEqual(["slide one", "slide two"]);
    expect(splitLibraryText("   ")).toEqual([]);
  });

  it("describes a usable material without sending its text", () => {
    const row = describeMaterial("m1", { title: "Biology notes", fileName: "bio.pdf", extractedText: "[Page 1] " + "cells ".repeat(20) + "\n[Page 2] " + "tissue ".repeat(20) }, null);
    expect(row).toMatchObject({ id: "m1", title: "Biology notes", pages: 2, problem: null, docId: null });
    expect(row.chars).toBeGreaterThan(200);
    expect(JSON.stringify(row)).not.toContain("cells cells");
  });

  it("says why a material can't be used", () => {
    expect(describeMaterial("m2", { title: "Scan", extractedText: "", isScanned: true }, null).problem).toMatch(/photos/i);
    expect(describeMaterial("m3", { title: "New", extractedText: "", status: "processing" }, null).problem).toMatch(/Still being read/);
    expect(describeMaterial("m4", { title: "Empty", extractedText: "x" }, null).problem).toMatch(/No readable/);
  });
});
