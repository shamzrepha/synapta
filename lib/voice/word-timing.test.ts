import { describe, expect, it } from "vitest";
import { boundariesToTimings, estimateWordTimings, mp3DurationMs, wordAt } from "./word-timing";

describe("word timings for the reading voice", () => {
  it("turns Edge's 100-nanosecond boundaries into milliseconds and drops bad ones", () => {
    const t = boundariesToTimings([{ text: "Hello", offset: 1_000_000, duration: 3_000_000 }, { text: " ", offset: 5, duration: 5 }, { text: "world", offset: 5_000_000, duration: 4_000_000 }, { text: "x" }]);
    expect(t).toEqual([{ t: "Hello", s: 100, e: 400 }, { t: "world", s: 500, e: 900 }]);
  });

  it("works out the length of the 48 kbps MP3 from its size", () => {
    expect(mp3DurationMs(6000)).toBe(1000);
  });

  it("spreads a passage over its words: longer words and sentence ends take longer, the total is the audio's length", () => {
    const t = estimateWordTimings("Ventricles pump blood. Atria receive it", 4000);
    expect(t.map((w) => w.t)).toEqual(["Ventricles", "pump", "blood.", "Atria", "receive", "it"]);
    expect(t[0].s).toBe(0);
    expect(t[t.length - 1].e).toBeGreaterThanOrEqual(3995);
    expect(t[0].e - t[0].s).toBeGreaterThan(t[1].e - t[1].s);
    for (let i = 1; i < t.length; i++) expect(t[i].s).toBeGreaterThanOrEqual(t[i - 1].e - 1);
    expect(estimateWordTimings("", 1000)).toEqual([]);
  });

  it("finds the word being said", () => {
    const t = estimateWordTimings("one two three four", 4000);
    expect(wordAt(t, -5)).toBe(-1);
    expect(wordAt(t, 0)).toBe(0);
    expect(wordAt(t, 1500)).toBe(1);
    expect(wordAt(t, 99999)).toBe(3);
  });
});
