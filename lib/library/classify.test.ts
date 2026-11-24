import { describe, it, expect } from "vitest";
import { classifyFile, titleFromName } from "./classify";

describe("classifyFile (by name and size, never by content)", () => {
  it("reads a course code and its level", () => {
    const c = classifyFile({ fileName: "MCE_302 Lecture Notes Week 3.pdf", pages: 30 });
    expect(c.courseCode).toBe("MCE 302");
    expect(c.level).toBe(300);
    expect(c.kind).toBe("lecture_note");
    expect(c.readPolicy).toBe("full");
  });
  it("files a long book as a textbook and does not read it", () => {
    const c = classifyFile({ fileName: "Engineering Mechanics 12th Edition.pdf", pages: 1040 });
    expect(c.kind).toBe("textbook");
    expect(c.readPolicy).toBe("index_only");
    expect(c.confidence).toBeGreaterThan(0.8);
  });
  it("spots past questions and slides", () => {
    expect(classifyFile({ fileName: "EEE 201 past questions 2022.pdf", pages: 8 }).kind).toBe("past_question");
    expect(classifyFile({ fileName: "intro.pptx" }).kind).toBe("slides");
  });
  it("is unsure about a vague name, so an AI look at the name can help", () => {
    const c = classifyFile({ fileName: "scan0023.pdf", pages: 40 });
    expect(c.kind).toBe("other");
    expect(c.confidence).toBeLessThan(0.6);
  });
  it("treats any long file as index-only even if the name is vague", () => {
    expect(classifyFile({ fileName: "scan0023.pdf", pages: 600 }).readPolicy).toBe("index_only");
    expect(titleFromName("my_notes.final.pdf")).toBe("my notes.final");
  });
});
