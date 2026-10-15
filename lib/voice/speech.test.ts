import { describe, it, expect } from "vitest";
import { chunkForSpeech, cleanForSpeech, collectTranscript, getRecognitionCtor } from "./speech";

describe("cleanForSpeech", () => {
  it("strips markdown, links and latex commands", () => {
    const out = cleanForSpeech("## Title\n- **bold** item with [a link](http://x.y)\n\n$$\\frac{a}{b}$$ and `code`");
    expect(out).not.toMatch(/[#*`\\{}]|http/);
    expect(out).toContain("Title");
    expect(out).toContain("bold item with a link");
  });
  it("drops fenced code", () => {
    expect(cleanForSpeech("before ```js\nlet x=1\n``` after")).toBe("before code omitted. after");
  });
});

describe("chunkForSpeech", () => {
  it("keeps short text in one chunk and splits long text on sentences", () => {
    expect(chunkForSpeech("Hello there.")).toEqual(["Hello there."]);
    const long = Array.from({ length: 30 }, (_, i) => `This is sentence number ${i}.`).join(" ");
    const chunks = chunkForSpeech(long, 100);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
    expect(chunks.join(" ")).toBe(long);
  });
  it("splits a single huge sentence by words", () => {
    const chunks = chunkForSpeech("word ".repeat(100).trim(), 50);
    expect(chunks.every((c) => c.length <= 50)).toBe(true);
  });
});

describe("recognition helpers", () => {
  it("collects final and interim transcripts", () => {
    const r = [
      Object.assign([{ transcript: "what is " }], { isFinal: true }),
      Object.assign([{ transcript: "photosynthesis" }], { isFinal: false }),
    ] as unknown as Parameters<typeof collectTranscript>[0];
    expect(collectTranscript(r)).toEqual({ final: "what is", interim: "photosynthesis" });
  });
  it("detects support", () => {
    class X {}
    expect(getRecognitionCtor({})).toBeNull();
    expect(getRecognitionCtor({ webkitSpeechRecognition: X })).toBe(X);
  });
});
