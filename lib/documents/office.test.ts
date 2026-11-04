import { describe, it, expect } from "vitest";
import zlib from "node:zlib";
import { docxXmlToText, pptxSlideToText, readDocx, readPptx } from "./office";
import { condenseForSyllabus, looksLikeHeading, SYLLABUS_SEED_MAX } from "./outline";
import { SEED_MATERIAL_MAX_CHARS } from "@/lib/teacher/classBuildRequest";

/** Builds a small real ZIP (a mix of deflated and stored entries) to read back. */
function makeZip(files: Record<string, string>, deflate = true): ArrayBuffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameB = Buffer.from(name);
    const raw = Buffer.from(content);
    const data = deflate ? zlib.deflateRawSync(raw) : raw;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(deflate ? 8 : 0, 8);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameB.length, 26);
    parts.push(lh, nameB, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(deflate ? 8 : 0, 10);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(nameB.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameB);
    offset += 30 + nameB.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...parts, cd, end]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.length);
}

const docx = `<w:document><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Unit 1: Forces</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Newton &amp; </w:t></w:r><w:r><w:t>friends</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Friction</w:t></w:r></w:p>
<w:p></w:p></w:body></w:document>`;

describe("Word and PowerPoint reading", () => {
  it("keeps headings and joins runs in a Word paragraph", () => {
    expect(docxXmlToText(docx)).toBe("# Unit 1: Forces\nNewton & friends\n## Friction");
  });
  it("reads slide paragraphs", () => {
    expect(pptxSlideToText("<p:sld><a:p><a:r><a:t>Title</a:t></a:r></a:p><a:p><a:r><a:t>Point &lt;1&gt;</a:t></a:r></a:p></p:sld>")).toBe("Title\nPoint <1>");
  });
  it("unzips a real .docx (deflated) and a stored one", async () => {
    expect(await readDocx(makeZip({ "word/document.xml": docx, "other.xml": "x" }))).toContain("# Unit 1: Forces");
    expect(await readDocx(makeZip({ "word/document.xml": docx }, false))).toContain("Newton & friends");
  });
  it("reads slides in order", async () => {
    const z = makeZip({
      "ppt/slides/slide2.xml": "<a:p><a:r><a:t>Second</a:t></a:r></a:p>",
      "ppt/slides/slide10.xml": "<a:p><a:r><a:t>Tenth</a:t></a:r></a:p>",
      "ppt/slides/slide1.xml": "<a:p><a:r><a:t>First</a:t></a:r></a:p>",
    });
    expect(await readPptx(z)).toBe("[Slide 1]\nFirst\n\n[Slide 2]\nSecond\n\n[Slide 3]\nTenth");
  });
  it("says so when the file is not an office document", async () => {
    await expect(readDocx(new TextEncoder().encode("plain text").buffer as ArrayBuffer)).rejects.toThrow(/valid Word/);
  });
});

describe("condensing a long document for the class builder", () => {
  it("recognises headings", () => {
    for (const h of ["Chapter 3: Waves", "2.1 Ohm's law", "# Intro", "INTRODUCTION TO CIRCUITS", "Week 4", "III. Kinematics"]) expect(looksLikeHeading(h), h).toBe(true);
    for (const t of ["a", "This is an ordinary sentence of body text that ends with a full stop.", "12345", "x".repeat(200)]) expect(looksLikeHeading(t), t).toBe(false);
  });
  it("uses the same limit as the class-build API", () => {
    expect(SYLLABUS_SEED_MAX).toBe(SEED_MATERIAL_MAX_CHARS);
  });
  it("leaves a short document alone", () => {
    const r = condenseForSyllabus("Chapter 1\nhello", 1000);
    expect(r).toMatchObject({ condensed: false, text: "Chapter 1\nhello" });
  });
  it("keeps the opening and the headings of everything after it, within the limit", () => {
    const body = Array.from({ length: 300 }, (_, i) => `[Page ${i + 1}]\nChapter ${i + 1}: Topic ${i + 1}\n${"lorem ipsum dolor sit amet ".repeat(40)}`).join("\n");
    const r = condenseForSyllabus(body, 8000, 2000);
    expect(r.condensed).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(8000);
    expect(r.text).toContain("Chapter 2: Topic 2");
    expect(r.text).toContain("Chapter 40: Topic 40  [Page 40]");
    expect(r.text).toContain("headings only");
  });
});
