import { describe, expect, it } from "vitest";
import { cleanCards } from "./clean";

describe("cleanCards", () => {
  it("trims, drops empties and duplicate fronts, and caps the count", () => {
    const out = cleanCards(
      [
        { front: "  What is ATP?  ", back: " Energy currency " },
        { front: "what is atp?", back: "dup" },
        { front: "", back: "x" },
        { front: "Q3?", back: "" },
        { front: "Q4?", back: "A4" },
        { front: "Q5?", back: "A5" },
      ],
      2
    );
    expect(out).toEqual([
      { front: "What is ATP?", back: "Energy currency" },
      { front: "Q4?", back: "A4" },
    ]);
  });
  it("clips very long text", () => {
    const [c] = cleanCards([{ front: "x".repeat(1000), back: "y".repeat(1000) }], 5);
    expect(c.front.length).toBe(300);
    expect(c.back.length).toBe(600);
  });
});
