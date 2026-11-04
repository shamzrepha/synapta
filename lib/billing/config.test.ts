import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let doc: { exists: boolean; data?: () => unknown } | "error" = { exists: false };
let reads = 0;
vi.mock("@/lib/firebase/admin", () => ({
  Timestamp: { now: () => new Date() },
  adminDb: () => ({
    collection: () => ({
      doc: () => ({
        get: async () => {
          reads++;
          if (doc === "error") throw new Error("offline");
          return doc;
        },
        set: async (v: unknown) => {
          doc = { exists: true, data: () => v };
        },
      }),
    }),
  }),
}));

import { clearConfigCache, getBillingConfig, isEnforced, parseConfig, resolveEnforced, saveBillingConfig } from "./config";

describe("who is limited", () => {
  it("follows the saved switch, and the environment only until one is saved", () => {
    expect(resolveEnforced(null, "u1", true)).toBe(true);
    expect(resolveEnforced(null, "u1", false)).toBe(false);
    expect(resolveEnforced({ mode: "off", testers: [] }, "u1", true)).toBe(false);
    expect(resolveEnforced({ mode: "all", testers: [] }, "u1", false)).toBe(true);
  });
  it("test-accounts mode limits only the listed accounts", () => {
    const cfg = { mode: "testers" as const, testers: ["dummy"] };
    expect(resolveEnforced(cfg, "dummy", false)).toBe(true);
    expect(resolveEnforced(cfg, "someone-else", false)).toBe(false);
    expect(resolveEnforced(cfg, null, false)).toBe(false);
  });
  it("ignores a broken saved value", () => {
    expect(parseConfig({ mode: "maybe" })).toBeNull();
    expect(parseConfig(null)).toBeNull();
    expect(parseConfig({ mode: "testers", testers: ["a", 5, "", "b"] })).toEqual({ mode: "testers", testers: ["a", "b"] });
  });
});

describe("the switch in the database", () => {
  beforeEach(() => {
    doc = { exists: false };
    reads = 0;
    clearConfigCache();
    delete process.env.BILLING_ENFORCED;
  });
  afterEach(() => {
    delete process.env.BILLING_ENFORCED;
  });

  it("uses the environment setting when nothing is saved", async () => {
    expect(await isEnforced("u1")).toBe(false);
    process.env.BILLING_ENFORCED = "1";
    expect(await isEnforced("u1")).toBe(true);
  });
  it("an admin's saved choice beats the environment, and changes take effect straight after saving", async () => {
    process.env.BILLING_ENFORCED = "1";
    await saveBillingConfig({ mode: "testers", testers: ["dummy"] }, "admin1");
    expect(await isEnforced("dummy")).toBe(true);
    expect(await isEnforced("real-student")).toBe(false);
    await saveBillingConfig({ mode: "off", testers: ["dummy"] }, "admin1");
    expect(await isEnforced("dummy")).toBe(false);
  });
  it("reads the database once per few seconds, not on every request", async () => {
    await getBillingConfig();
    await getBillingConfig();
    await isEnforced("u1");
    expect(reads).toBe(1);
  });
  it("falls back to the environment if the database can't be read, without caching the failure", async () => {
    doc = "error";
    process.env.BILLING_ENFORCED = "1";
    expect(await isEnforced("u1")).toBe(true);
    doc = { exists: true, data: () => ({ mode: "off", testers: [] }) };
    expect(await isEnforced("u1")).toBe(false);
  });
});
