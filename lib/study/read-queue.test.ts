import { describe, expect, it } from "vitest";
import { buildReadQueue } from "./read-queue";

describe("buildReadQueue", () => {
  it("reads the title, each heading once, then the paragraphs tied to their block", () => {
    const q = buildReadQueue("LEDs", "## Basics\nAn **LED** glows.\n\nIt needs a resistor.\n\n## Wiring\nUse the longer leg.");
    expect(q.map((c) => c.text)).toEqual(["LEDs.", "Basics.", "An LED glows.", "It needs a resistor.", "Wiring.", "Use the longer leg."]);
    expect(q[2].block).toContain("LED");
    expect(q[0].block).toBe("");
  });
  it("splits long paragraphs into chunks that keep the same block", () => {
    const long = "This is a sentence about diodes. ".repeat(40);
    const q = buildReadQueue("T", long, 200);
    const chunks = q.filter((c) => c.block);
    expect(chunks.length).toBeGreaterThan(2);
    expect(new Set(chunks.map((c) => c.block)).size).toBe(1);
    expect(chunks.every((c) => c.text.length <= 260)).toBe(true);
  });
  it("is empty-safe", () => {
    expect(buildReadQueue("", "")).toEqual([]);
  });
});
