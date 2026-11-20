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
  it("keys by client IP, never by the token, so junk tokens cannot mint new buckets", () => {
    const a = clientKey(headers({ "x-forwarded-for": "1.2.3.4" }), "junk-one");
    const b = clientKey(headers({ "x-forwarded-for": "1.2.3.4" }), "junk-two");
    expect(a.key).toBe("ip:1.2.3.4");
    expect(b.key).toBe(a.key);
    expect(JSON.stringify(a)).not.toContain("junk");
  });
  it("uses the first forwarded hop, then x-real-ip, then a shared fallback", () => {
    expect(clientKey(headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }), undefined)).toEqual({ key: "ip:1.2.3.4", signedIn: false });
    expect(clientKey(headers({ "x-real-ip": "5.6.7.8" }), undefined).key).toBe("ip:5.6.7.8");
    expect(clientKey(headers({}), undefined).key).toBe("ip:unknown");
  });
  it("ignores malformed forwarded values", () => {
    expect(clientKey(headers({ "x-forwarded-for": "<script>, 1.1.1.1" }), undefined).key).toBe("ip:unknown");
  });
  it("treats a credential only as a hint for the higher per-IP limit (it is not verified here)", () => {
    expect(clientKey(headers({}), "abc").signedIn).toBe(true);
    expect(clientKey(headers({ authorization: "Bearer abc" }), undefined).signedIn).toBe(true);
    expect(clientKey(headers({}), undefined).signedIn).toBe(false);
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
