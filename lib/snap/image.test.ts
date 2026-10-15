import { describe, it, expect } from "vitest";
import { parseImageDataUrl, deriveSnapTitle } from "./image";

describe("parseImageDataUrl", () => {
  const b64 = "A".repeat(200);
  it("accepts small jpeg/png/webp data urls", () => {
    expect(parseImageDataUrl(`data:image/jpeg;base64,${b64}`)).toEqual({ mimeType: "image/jpeg", data: b64 });
    expect(parseImageDataUrl(`data:image/png;base64,${b64}`)?.mimeType).toBe("image/png");
  });
  it("rejects other types, junk and oversize", () => {
    expect(parseImageDataUrl(`data:image/gif;base64,${b64}`)).toBeNull();
    expect(parseImageDataUrl(`data:text/html;base64,${b64}`)).toBeNull();
    expect(parseImageDataUrl("not a url")).toBeNull();
    expect(parseImageDataUrl(`data:image/jpeg;base64,${"A".repeat(3_000_001)}`)).toBeNull();
    expect(parseImageDataUrl("data:image/jpeg;base64,AAAA")).toBeNull();
  });
});

describe("deriveSnapTitle", () => {
  it("uses the first meaningful line without markdown noise", () => {
    expect(deriveSnapTitle("## **Solving** $x^2=4$\n\nstep 1")).toBe("Solving x^2=4");
  });
  it("falls back and truncates", () => {
    expect(deriveSnapTitle("")).toBe("Homework problem");
    expect(deriveSnapTitle("a".repeat(100)).length).toBe(68);
  });
});
