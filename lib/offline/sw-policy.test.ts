import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const P = require("../../public/sw-policy.js") as {
  isNeverCache: (u: string) => boolean;
  isStaticAsset: (u: string) => boolean;
  isDownloadable: (m: string, u: string) => boolean;
};

describe("service worker policy", () => {
  it("never caches auth/session style endpoints", () => {
    for (const u of ["/api/auth/session", "/api/auth/login", "/api/me", "/api/sessions", "/api/admin/users", "/api/x?idToken=abc"]) {
      expect(P.isNeverCache(u)).toBe(true);
      expect(P.isDownloadable("GET", u)).toBe(false);
    }
  });
  it("allows lesson/notebook GETs only", () => {
    expect(P.isDownloadable("GET", "/api/notebooks/abc")).toBe(true);
    expect(P.isDownloadable("GET", "/api/classes/c1")).toBe(true);
    expect(P.isDownloadable("POST", "/api/notebooks/abc")).toBe(false);
    expect(P.isDownloadable("GET", "/dashboard")).toBe(false);
  });
  it("recognises Next static assets", () => {
    expect(P.isStaticAsset("/_next/static/chunks/a.js")).toBe(true);
    expect(P.isStaticAsset("/api/_next/static")).toBe(false);
  });
});
