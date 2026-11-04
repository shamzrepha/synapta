import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const users = new Map<string, Record<string, unknown>>();
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => ({
    collection: (c: string) => ({
      doc: (id: string) => ({ path: `${c}/${id}` }),
      where: () => ({ where: () => ({ path: "reservations-query" }) }),
    }),
    runTransaction: async (fn: (t: unknown) => Promise<unknown>) =>
      fn({
        get: async (r: { path: string }) => (r.path === "reservations-query" ? { docs: [] } : { exists: users.has(r.path), data: () => users.get(r.path) }),
        set: () => undefined,
        update: () => undefined,
      }),
  }),
  FieldValue: { increment: (n: number) => n },
  Timestamp: { now: () => new Date(), fromMillis: (ms: number) => new Date(ms) },
}));
vi.mock("@/lib/rateLimit", () => ({ evaluateSharedRateLimit: async () => ({ success: true, resetMs: 0 }) }));

import { reserveQuota } from "./guard";

const period = new Date().toISOString().slice(0, 7);
const base = { usagePeriod: period, monthlyTokensUsed: 0 };
const future = { toMillis: () => Date.now() + 10 * 86_400_000 };
const can = async (uid: string, tokens: number) => {
  try {
    const r = await reserveQuota(uid, tokens);
    return r.id === null ? "uncapped" : "reserved";
  } catch {
    return "blocked";
  }
};

describe("monthly AI budget by plan", () => {
  beforeEach(() => {
    users.clear();
    users.set("users/free", { ...base, role: "student", monthlyTokenLimit: 50_000 });
    users.set("users/plus", { ...base, role: "student", monthlyTokenLimit: 50_000, plan: "plus", planExpiresAt: future });
    users.set("users/lapsed", { ...base, role: "student", monthlyTokenLimit: 50_000, plan: "plus", planExpiresAt: { toMillis: () => Date.now() - 1000 } });
    users.set("users/teacher", { ...base, role: "teacher", monthlyTokenLimit: 1_000_000 });
    users.set("users/paidteacher", { ...base, role: "teacher", monthlyTokenLimit: 1_000_000, plan: "teacher", planExpiresAt: future });
    users.set("users/admin", { ...base, role: "admin" });
  });
  afterEach(() => {
    delete process.env.BILLING_ENFORCED;
  });

  it("changes nothing while billing is off: students keep 50,000 and teachers stay uncapped", async () => {
    expect(await can("free", 40_000)).toBe("reserved");
    expect(await can("free", 60_000)).toBe("blocked");
    expect(await can("plus", 60_000)).toBe("blocked");
    expect(await can("teacher", 5_000_000)).toBe("uncapped");
  });

  it("enforced: Free gets 100,000, Student Plus 1,200,000, and a lapsed plan falls back to Free", async () => {
    process.env.BILLING_ENFORCED = "1";
    expect(await can("free", 90_000)).toBe("reserved");
    expect(await can("free", 110_000)).toBe("blocked");
    expect(await can("plus", 1_100_000)).toBe("reserved");
    expect(await can("plus", 1_300_000)).toBe("blocked");
    expect(await can("lapsed", 110_000)).toBe("blocked");
  });

  it("enforced: unpaid teachers get a 1,000,000 trial budget, paid Teacher 15,000,000, admins are never capped", async () => {
    process.env.BILLING_ENFORCED = "1";
    expect(await can("teacher", 900_000)).toBe("reserved");
    expect(await can("teacher", 1_200_000)).toBe("blocked");
    expect(await can("paidteacher", 14_000_000)).toBe("reserved");
    expect(await can("paidteacher", 16_000_000)).toBe("blocked");
    expect(await can("admin", 50_000_000)).toBe("uncapped");
  });
});
