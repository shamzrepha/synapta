import { describe, it, expect, beforeEach } from "vitest";
import { bodyTooLarge, clientKey, isCrossSiteWrite, resetWriteLimiter, writeRetryAfter } from "./api-guard";

const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

describe("isCrossSiteWrite", () => {
  it("blocks a write from another site", () => {
    expect(isCrossSiteWrite("POST", "https://evil.example", "sunroot.app")).toBe(true);
    expect(isCrossSiteWrite("DELETE", "null", "sunroot.app")).toBe(true);
  });
  it("allows same-site writes, reads and requests without an Origin", () => {
    expect(isCrossSiteWrite("POST", "https://sunroot.app", "sunroot.app")).toBe(false);
    expect(isCrossSiteWrite("GET", "https://evil.example", "sunroot.app")).toBe(false);
    expect(isCrossSiteWrite("POST", null, "sunroot.app")).toBe(false);
  });
  it("compares the port too", () => {
    expect(isCrossSiteWrite("POST", "http://localhost:4000", "localhost:3000")).toBe(true);
  });
});

describe("clientKey", () => {
  it("prefers the session credential and never keeps the whole token", () => {
    const token = "x".repeat(100) + "TAIL1234567890ABCDEFGHIJ";
    const k = clientKey(headers({}), token);
    expect(k.signedIn).toBe(true);
    expect(k.key.length).toBeLessThan(40);
  });
  it("falls back to the first forwarded IP", () => {
    expect(clientKey(headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }), undefined)).toEqual({ key: "ip:1.2.3.4", signedIn: false });
  });
});

describe("writeRetryAfter", () => {
  beforeEach(() => resetWriteLimiter());
  it("allows up to the limit in a window, then asks the client to wait", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) expect(writeRetryAfter("k", 3, 60_000, now + i)).toBe(0);
    expect(writeRetryAfter("k", 3, 60_000, now + 10)).toBeGreaterThan(0);
    expect(writeRetryAfter("other", 3, 60_000, now + 10)).toBe(0);
    expect(writeRetryAfter("k", 3, 60_000, now + 60_001)).toBe(0);
  });
});

describe("bodyTooLarge", () => {
  it("refuses bodies declared over the cap and allows unknown or small ones", () => {
    expect(bodyTooLarge(String(30 * 1024 * 1024))).toBe(true);
    expect(bodyTooLarge("1024")).toBe(false);
    expect(bodyTooLarge(null)).toBe(false);
  });
});
