import { describe, it, expect, afterEach, vi } from "vitest";

type Rule = { source: string; headers: Array<{ key: string; value: string }> };

async function siteHeaders(env: string): Promise<Record<string, string>> {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", env);
  const cfg = (await import("../../next.config")).default;
  const rule = ((await cfg.headers!()) as Rule[]).find((r) => r.source === "/(.*)")!;
  return Object.fromEntries(rule.headers.map((h) => [h.key, h.value]));
}
afterEach(() => vi.unstubAllEnvs());

describe("security headers", () => {
  it("production CSP has no unsafe-eval and upgrades insecure requests", async () => {
    const csp = (await siteHeaders("production"))["Content-Security-Policy"];
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });
  it("development keeps unsafe-eval (Next's refresh runtime needs it) and does not force https", async () => {
    const csp = (await siteHeaders("development"))["Content-Security-Policy"];
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
  it("keeps Google sign-in working: popups allowed, Firebase auth frame and API hosts allowed", async () => {
    const h = await siteHeaders("production");
    expect(h["Cross-Origin-Opener-Policy"]).toBe("same-origin-allow-popups");
    const csp = h["Content-Security-Policy"];
    expect(csp).toContain("https://apis.google.com");
    expect(csp).toContain("https://*.firebaseapp.com");
    expect(csp).toContain("https://identitytoolkit.googleapis.com");
    expect(csp).toContain("https://securetoken.googleapis.com");
  });
  it("limits camera and microphone to our own pages and sets a referrer policy", async () => {
    const h = await siteHeaders("production");
    expect(h["Permissions-Policy"]).toMatch(/camera=\(self\)/);
    expect(h["Permissions-Policy"]).toMatch(/microphone=\(self\)/);
    expect(h["Permissions-Policy"]).toMatch(/geolocation=\(\)/);
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });
});
