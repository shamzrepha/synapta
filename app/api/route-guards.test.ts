import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Safety net for every API route. Adding a route without a login check, or an admin route without the admin check, fails
 * here, so the mistake is caught in CI instead of in production.
 */
const API_DIR = path.join(process.cwd(), "app", "api");

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? routeFiles(p) : e.name === "route.ts" ? [p] : [];
  });
}
const rel = (p: string) => path.relative(API_DIR, p).split(path.sep).join("/");
const read = (p: string) => fs.readFileSync(p, "utf8");

/** A route may be open to signed-out visitors only if it is listed here, with the reason it is safe. */
const PUBLIC_ROUTES: Record<string, string> = {
  "health/route.ts": "uptime check, returns no data",
  "client-errors/route.ts": "error reporter, rate limited and size capped",
  "auth/session/route.ts": "sign-in: verifies the Firebase token itself",
  "auth/bootstrap/route.ts": "sign-up: verifies the Bearer token itself, rate limited",
  "auth/restore/route.ts": "verifies the session cookie itself",
  "billing/webhook/route.ts": "Paystack calls this: verified by HMAC signature",
};

const GUARDS = /requireUser|requireAdmin|requireTeacher|requireVerifiedEmail|verifySessionCookie|verifyIdToken|x-paystack-signature|CRON_SECRET|requireCaller|requireRole|loadChatForMember|getCaller/;

describe("API route guards", () => {
  const files = routeFiles(API_DIR);

  it("finds the routes", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("every route checks who is calling, unless it is on the public list", () => {
    const open = files.filter((f) => !GUARDS.test(read(f))).map(rel).sort();
    const unexpected = open.filter((r) => !(r in PUBLIC_ROUTES));
    expect(unexpected, `These routes have no login check. Add one, or list them in PUBLIC_ROUTES with the reason: ${unexpected.join(", ")}`).toEqual([]);
  });

  it("the public list has no stale entries", () => {
    const all = new Set(files.map(rel));
    expect(Object.keys(PUBLIC_ROUTES).filter((r) => !all.has(r))).toEqual([]);
  });

  it("every admin route checks for the admin role in every handler", () => {
    const admin = files.filter((f) => rel(f).startsWith("admin/"));
    expect(admin.length).toBeGreaterThan(5);
    const bad: string[] = [];
    for (const f of admin) {
      const src = read(f);
      const handlers = (src.match(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g) || []).length;
      const checks = (src.match(/requireUser\(\s*req\s*,\s*\[\s*["']admin["']/g) || []).length + (src.match(/requireAdmin\(/g) || []).length;
      if (checks < handlers) bad.push(`${rel(f)} (${handlers} handlers, ${checks} admin checks)`);
    }
    expect(bad, `Admin routes missing the admin check: ${bad.join("; ")}`).toEqual([]);
  });

  it("payment routes never take the person from the request body", () => {
    for (const r of ["billing/checkout/route.ts", "billing/verify/route.ts"]) {
      const src = read(path.join(API_DIR, r));
      expect(src, r).not.toMatch(/body\.uid|body\.userId|searchParams\.get\(["']uid["']\)/);
    }
  });
});
