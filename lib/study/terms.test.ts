import { describe, expect, it } from "vitest";
import { filterTerms, hashText, splitByTerms, termRegex } from "./terms";

describe("terms", () => {
  it("keeps only terms that appear in the text, once each", () => {
    expect(filterTerms(["LED", "led", "Anode", "missing thing", "x"], "An LED has an anode.")).toEqual(["LED", "Anode"]);
  });
  it("marks each term once per call, longest match first, whole words only", () => {
    const re = termRegex(["LED", "forward bias", "forward"]);
    const used = new Set<string>();
    const parts = splitByTerms("An LED under forward bias; another LED; ledger", re, used);
    expect(parts.filter((p) => p.term).map((p) => p.text)).toEqual(["LED", "forward bias"]);
    expect(parts.map((p) => p.text).join("")).toBe("An LED under forward bias; another LED; ledger");
  });
  it("returns plain text without terms", () => {
    expect(splitByTerms("hello", null, new Set())).toEqual([{ text: "hello", term: false }]);
  });
  it("hashes differently for different text", () => {
    expect(hashText("a")).not.toBe(hashText("b"));
  });
});
