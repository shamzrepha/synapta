import { describe, it, expect } from "vitest";
import { isSafePublicUrl } from "./provider";

describe("lib/research/provider", () => {
  it("blocks dangerous private IPs, loopbacks, and cloud metadata (SSRF defense)", () => {
    expect(isSafePublicUrl("http://localhost:3000")).toBe(false);
    expect(isSafePublicUrl("http://127.0.0.1/admin")).toBe(false);
    expect(isSafePublicUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isSafePublicUrl("http://10.0.0.1/internal")).toBe(false);
    expect(isSafePublicUrl("http://192.168.1.1/router")).toBe(false);
    expect(isSafePublicUrl("ftp://example.com")).toBe(false);
  });

  it("permits valid public HTTP and HTTPS URLs", () => {
    expect(isSafePublicUrl("https://en.wikipedia.org/wiki/Quantum_computing")).toBe(true);
    expect(isSafePublicUrl("https://arxiv.org/abs/2301.00001")).toBe(true);
    expect(isSafePublicUrl("https://ocw.mit.edu/courses/")).toBe(true);
  });
});
