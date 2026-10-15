import { describe, it, expect } from "vitest";
import { MAX_BYTES, normalizeTags, parseRange, sniffVideo, validateUpload } from "./rules";

describe("explainer rules", () => {
  it("rejects long or huge videos", () => {
    expect(validateUpload({ bytes: 1000, durationSec: 45, title: "Photosynthesis" })).toBeNull();
    expect(validateUpload({ bytes: 1000, durationSec: 61, title: "x" })).toMatch(/60 seconds/);
    expect(validateUpload({ bytes: MAX_BYTES + 1, durationSec: 30, title: "x" })).toMatch(/25 MB/);
    expect(validateUpload({ bytes: 1000, durationSec: 0, title: "x" })).toMatch(/length/);
    expect(validateUpload({ bytes: 1000, durationSec: 10, title: "  " })).toMatch(/title/);
  });
  it("normalises tags", () => {
    expect(normalizeTags("#Physics, forces  #Physics a")).toEqual(["physics", "forces"]);
    expect(normalizeTags(["#A1", "b-c!"])).toEqual(["a1", "bc"]);
    expect(normalizeTags("aa bb cc dd ee ff gg").length).toBe(5);
  });
  it("sniffs video containers", () => {
    const mp4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    const mov = new Uint8Array([0, 0, 0, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20]);
    const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffVideo(mp4)?.type).toBe("video/mp4");
    expect(sniffVideo(mov)?.type).toBe("video/quicktime");
    expect(sniffVideo(webm)?.type).toBe("video/webm");
    expect(sniffVideo(new Uint8Array(20))).toBeNull();
  });
  it("parses ranges", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=50-500", 100)).toEqual({ start: 50, end: 99 });
    expect(parseRange("bytes=200-300", 100)).toBeNull();
    expect(parseRange("junk", 100)).toBeNull();
  });
});
