import { describe, it, expect } from "vitest";
import nextConfig from "../../next.config";

type Rule = { source: string; headers: Array<{ key: string; value: string }> };

async function rules(): Promise<Rule[]> {
  return (await nextConfig.headers!()) as Rule[];
}
const csp = (r: Rule) => r.headers.find((h) => h.key === "Content-Security-Policy")!.value;
const scriptSrc = (value: string) => /script-src([^;]*)/.exec(value)![1];

describe("content security policy and the push-notification worker", () => {
  it("lets only the push worker's own file load Firebase's scripts from gstatic.com", async () => {
    const all = await rules();
    const site = all.find((r) => r.source === "/(.*)")!;
    const worker = all.find((r) => r.source === "/firebase-messaging-sw.js")!;
    expect(worker, "the worker file needs its own header rule, or notifications fail to register").toBeDefined();
    expect(scriptSrc(csp(worker))).toContain("https://www.gstatic.com");
    expect(scriptSrc(csp(site))).not.toContain("gstatic.com");
  });
  it("comes after the site-wide rule, so its headers win for that file", async () => {
    const all = await rules();
    expect(all.findIndex((r) => r.source === "/firebase-messaging-sw.js")).toBeGreaterThan(all.findIndex((r) => r.source === "/(.*)"));
  });
  it("never serves a stale worker, and keeps the other security headers on it", async () => {
    const worker = (await rules()).find((r) => r.source === "/firebase-messaging-sw.js")!;
    const keys = worker.headers.map((h) => h.key);
    expect(keys).toEqual(expect.arrayContaining(["Cache-Control", "X-Content-Type-Options", "Strict-Transport-Security", "X-Frame-Options"]));
    expect(keys.filter((k) => k === "Content-Security-Policy")).toHaveLength(1);
  });
  it("keeps every other part of the policy identical for the worker", async () => {
    const all = await rules();
    const strip = (v: string) => v.replace(/ https:\/\/www\.gstatic\.com/, "");
    expect(strip(csp(all.find((r) => r.source === "/firebase-messaging-sw.js")!))).toBe(csp(all.find((r) => r.source === "/(.*)")!));
  });
});
