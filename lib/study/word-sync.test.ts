import { describe, expect, it } from "vitest";
import { alignSpoken, normWord, splitDomWords } from "./word-sync";

describe("word sync", () => {
  it("splits a line of the page into words with their positions", () => {
    const w = splitDomWords("The heart's four chambers (atria) pump.");
    expect(w.map((x) => x.word)).toEqual(["The", "heart's", "four", "chambers", "atria", "pump"]);
    expect("The heart's four chambers (atria) pump.".slice(w[4].start, w[4].end)).toBe("atria");
    expect(normWord("Heart's,")).toBe("hearts");
  });

  it("matches the spoken words to the page words in order", () => {
    const dom = ["Your", "heart", "has", "four", "chambers", "The", "two", "upper", "ones"];
    const { map, next } = alignSpoken(["Your", "heart", "has", "four", "chambers"], dom);
    expect(map).toEqual([0, 1, 2, 3, 4]);
    expect(next).toBe(5);
  });

  it("carries on from where the last piece of the paragraph ended, finding the start of a later piece", () => {
    const dom = ["a", "b", "c", "Blood", "always", "travels", "in", "a", "loop"];
    const { map } = alignSpoken(["Blood", "always", "travels"], dom, 0);
    expect(map).toEqual([3, 4, 5]);
    expect(alignSpoken(["in", "a", "loop"], dom, 6).map).toEqual([6, 7, 8]);
  });

  it("skips what the voice says that is not on the page (spelled-out symbols) without losing its place", () => {
    const dom = ["Oxygen", "is", "20", "%", "of", "air"];
    const { map } = alignSpoken(["Oxygen", "is", "twenty", "percent", "of", "air"], dom);
    expect(map).toEqual([0, 1, -1, -1, 4, 5]);
  });

  it("accepts plurals and ignores punctuation, and one stray word does not drag the match far", () => {
    const dom = ["The", "ventricles", "pump", "blood", ".", "Next", "topic", "starts", "here", "ventricles"];
    expect(alignSpoken(["ventricle", "pump", "blood"], dom).map).toEqual([1, 2, 3]);
    // "banana" is nowhere: no match, and "next" is still found right after
    expect(alignSpoken(["The", "banana", "Next"], dom).map).toEqual([0, -1, 5]);
  });

  it("starts at the first place the opening words follow one another, not at an earlier lone match", () => {
    // "definition" is also a heading earlier on the page; the passage really starts at the second one
    const dom = ["Definition", "and", "assessment", "Clinicians", "must", "therefore", "Definition", "Dyspnoea", "is", "a", "feeling"];
    expect(alignSpoken(["Definition", "Dyspnoea", "is", "a", "feeling"], dom).map).toEqual([6, 7, 8, 9, 10]);
    expect(alignSpoken(["Clinicians", "must", "therefore"], dom).map).toEqual([3, 4, 5]);
  });

  it("splits hyphenated words and maps a hyphenated word said as one", () => {
    expect(splitDomWords("a chest-tightness feeling").map((x) => x.word)).toEqual(["a", "chest", "tightness", "feeling"]);
    expect(alignSpoken(["a", "chesttightness", "feeling"], ["a", "chest", "tightness", "feeling"]).map).toEqual([0, 1, 3]);
  });
});
