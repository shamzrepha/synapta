import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- a small in-memory Firestore: documents, queries, and transactions that run one at a time (like contention retries)
const h = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  const state = { autoId: 0, lock: Promise.resolve() as Promise<unknown> };
  const refOf = (col: string, id: string) => ({ col, id, path: `${col}/${id}`, get: async () => ({ exists: store.has(`${col}/${id}`), data: () => store.get(`${col}/${id}`) }) });
  const inc = (n: number) => ({ __inc: n });
  const apply = (prev: Record<string, unknown> | undefined, data: Record<string, unknown>) => {
    const out = { ...(prev || {}) };
    for (const [k, v] of Object.entries(data)) {
      out[k] = v && typeof v === "object" && "__inc" in (v as object) ? (Number(out[k]) || 0) + (v as { __inc: number }).__inc : v;
    }
    return out;
  };
  return { store, state, refOf, inc, apply };
});

vi.mock("@/lib/firebase/admin", () => ({
  FieldValue: { increment: h.inc },
  Timestamp: { now: () => ({ ms: Date.now() }), fromMillis: (ms: number) => ({ ms }) },
  adminDb: () => ({
    collection: (col: string) => ({
      doc: (id?: string) => h.refOf(col, id ?? `auto_${++h.state.autoId}`),
      where: (f1: string, _o: string, v1: unknown) => ({
        where: (f2: string, _o2: string, v2: unknown) => ({
          kind: "query",
          run: () =>
            [...h.store.entries()]
              .filter(([p, d]) => p.startsWith(`${col}/`) && d[f1] === v1 && d[f2] === v2)
              .map(([p, d]) => ({ id: p.split("/")[1], data: () => d })),
          get: async () => ({
            docs: [...h.store.entries()]
              .filter(([p, d]) => p.startsWith(`${col}/`) && d[f1] === v1 && d[f2] === v2)
              .map(([p, d]) => ({ id: p.split("/")[1], data: () => d })),
          }),
        }),
      }),
      get: async () => ({ exists: false }),
    }),
    runTransaction: (fn: (t: unknown) => Promise<unknown>) => {
      const run = h.state.lock.then(async () => {
        const staged: Array<() => void> = [];
        const t = {
          get: async (r: { path?: string; kind?: string; run?: () => unknown[] }) => {
            if (r.kind === "query") return { docs: r.run!() };
            const d = h.store.get(r.path!);
            return { exists: !!d, data: () => d };
          },
          set: (r: { path: string }, data: Record<string, unknown>, o?: { merge?: boolean }) => staged.push(() => h.store.set(r.path, o?.merge ? h.apply(h.store.get(r.path), data) : h.apply(undefined, data))),
          update: (r: { path: string }, data: Record<string, unknown>) => staged.push(() => h.store.set(r.path, h.apply(h.store.get(r.path), data))),
        };
        const out = await fn(t);
        staged.forEach((s) => s());
        return out;
      });
      h.state.lock = run.catch(() => undefined);
      return run;
    },
  }),
}));

const rate = vi.hoisted(() => ({ ok: true }));
vi.mock("@/lib/rateLimit", () => ({
  evaluateSharedRateLimit: async () => (rate.ok ? { success: true, remaining: 5, resetMs: 60_000 } : { success: false, remaining: 0, resetMs: 30_000 }),
}));

import { checkRateLimitAndQuota, releaseQuota, reserveQuota, settleQuota } from "./guard";

const period = new Date().toISOString().slice(0, 7);
const seedUser = (uid: string, extra: Record<string, unknown> = {}) => h.store.set(`users/${uid}`, { role: "student", monthlyTokenLimit: 10_000, monthlyTokensUsed: 0, usagePeriod: period, ...extra });

beforeEach(() => {
  h.store.clear();
  h.state.autoId = 0;
  rate.ok = true;
});

describe("AI token reservations", () => {
  it("lets concurrent requests reserve only what the budget can cover (no overspend)", async () => {
    seedUser("u1", { monthlyTokenLimit: 10_000 });
    // 5 requests at once, 3,000 tokens each: only 3 fit
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => reserveQuota("u1", 3_000)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(2);
    expect(rejected[0].reason).toMatchObject({ code: "QUOTA_EXCEEDED", status: 429 });
  });

  it("counts tokens already used plus reservations in flight", async () => {
    seedUser("u1", { monthlyTokensUsed: 8_000 });
    await expect(reserveQuota("u1", 1_500)).resolves.toMatchObject({ tokens: 1_500 });
    await expect(reserveQuota("u1", 1_000)).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
  });

  it("settles against the real usage and frees the unused part of the estimate", async () => {
    seedUser("u1");
    const res = await reserveQuota("u1", 4_000);
    expect(await settleQuota(res, 700, 300)).toBe(true);
    expect(h.store.get("users/u1")?.monthlyTokensUsed).toBe(1_000);
    // the 4,000 reservation no longer counts: 9,000 more fits
    await expect(reserveQuota("u1", 9_000)).resolves.toBeTruthy();
  });

  it("charges a request once even if it is settled twice (a retry)", async () => {
    seedUser("u1");
    const res = await reserveQuota("u1", 2_000);
    expect(await settleQuota(res, 500, 500)).toBe(true);
    expect(await settleQuota(res, 500, 500)).toBe(false);
    expect(h.store.get("users/u1")?.monthlyTokensUsed).toBe(1_000);
  });

  it("gives the tokens back when the call fails, and a released reservation can't be charged later", async () => {
    seedUser("u1");
    const res = await reserveQuota("u1", 9_000);
    await expect(reserveQuota("u1", 2_000)).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
    await releaseQuota(res);
    await expect(reserveQuota("u1", 2_000)).resolves.toBeTruthy();
    expect(await settleQuota(res, 100, 100)).toBe(false);
    expect(h.store.get("users/u1")?.monthlyTokensUsed).toBe(0);
  });

  it("stops counting a reservation that was never settled once it expires", async () => {
    seedUser("u1");
    const t0 = Date.now();
    await reserveQuota("u1", 9_500, t0);
    await expect(reserveQuota("u1", 1_000, t0 + 60_000)).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
    await expect(reserveQuota("u1", 1_000, t0 + 11 * 60_000)).resolves.toBeTruthy();
  });

  it("starts a new month at zero used", async () => {
    seedUser("u1", { monthlyTokensUsed: 49_000, monthlyTokenLimit: 50_000, usagePeriod: "2000-01" });
    const res = await reserveQuota("u1", 40_000);
    expect(res.id).toBeTruthy();
    await settleQuota(res, 10, 10);
    expect(h.store.get("users/u1")).toMatchObject({ monthlyTokensUsed: 20, usagePeriod: period });
  });

  it("does not cap teachers and admins, but still records what they use", async () => {
    seedUser("t1", { role: "teacher", monthlyTokenLimit: 1_000 });
    const res = await reserveQuota("t1", 500_000);
    expect(res.id).toBeNull();
    await settleQuota(res, 400, 600);
    expect(h.store.get("users/t1")?.monthlyTokensUsed).toBe(1_000);
  });
});

describe("admission check", () => {
  it("rejects with 429 and Retry-After when the shared rate limit is exceeded", async () => {
    seedUser("u1");
    rate.ok = false;
    await expect(checkRateLimitAndQuota("u1", 100)).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429, headers: { "Retry-After": "30" } });
  });

  it("includes reservations already in flight, so a stale snapshot can't wave a request through", async () => {
    seedUser("u1");
    await reserveQuota("u1", 9_500);
    await expect(checkRateLimitAndQuota("u1", 1_000)).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
  });
});
