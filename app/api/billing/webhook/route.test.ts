import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

const docs = new Map<string, Record<string, unknown>>();
const ref = (path: string) => ({ path, get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }) });
vi.mock("@/lib/firebase/admin", () => ({
  Timestamp: { now: () => ({ toMillis: () => Date.now() }), fromMillis: (ms: number) => ({ toMillis: () => ms }) },
  adminDb: () => ({
    collection: (c: string) => ({ doc: (id: string) => ref(`${c}/${id}`) }),
    runTransaction: async (fn: (t: unknown) => Promise<unknown>) =>
      fn({
        get: (r: { get: () => unknown }) => r.get(),
        set: (r: { path: string }, v: Record<string, unknown>) => void docs.set(r.path, v),
        update: (r: { path: string }, v: Record<string, unknown>) => void docs.set(r.path, { ...(docs.get(r.path) || {}), ...v }),
      }),
  }),
}));

import { POST } from "./route";

const SECRET = "sk_test_abc";
const call = (body: unknown, sig?: string | null) => {
  const raw = JSON.stringify(body);
  const s = sig === undefined ? crypto.createHmac("sha512", SECRET).update(raw).digest("hex") : sig;
  return POST(new Request("http://x/api/billing/webhook", { method: "POST", body: raw, headers: s ? { "x-paystack-signature": s } : {} }) as never);
};
const charge = (over: Record<string, unknown> = {}) => ({ event: "charge.success", data: { status: "success", reference: "ref1", amount: 200_000, currency: "NGN", metadata: { uid: "u1", plan: "plus", term: "month" }, ...over } });

describe("paystack webhook", () => {
  beforeEach(() => {
    docs.clear();
    docs.set("users/u1", { role: "student" });
    process.env.PAYSTACK_SECRET_KEY = SECRET;
  });
  it("rejects a wrong or missing signature and changes nothing", async () => {
    expect((await call(charge(), "bad")).status).toBe(401);
    expect((await call(charge(), null)).status).toBe(401);
    expect(docs.get("users/u1")).toEqual({ role: "student" });
  });
  it("activates the plan for a valid payment, once", async () => {
    const first = await (await call(charge())).json();
    expect(first.applied).toBe(true);
    const u = docs.get("users/u1") as { plan: string; planExpiresAt: { toMillis: () => number } };
    expect(u.plan).toBe("plus");
    const expiry = u.planExpiresAt.toMillis();
    expect(expiry).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    const again = await (await call(charge())).json();
    expect(again.applied).toBe(false);
    expect((docs.get("users/u1") as { planExpiresAt: { toMillis: () => number } }).planExpiresAt.toMillis()).toBe(expiry);
  });
  it("ignores an underpayment", async () => {
    const r = await (await call(charge({ amount: 5_000 }))).json();
    expect(r.ignored).toBe(true);
    expect(docs.get("users/u1")).toEqual({ role: "student" });
  });
  it("ignores a payment for an account that doesn't exist", async () => {
    const r = await (await call(charge({ metadata: { uid: "ghost", plan: "plus", term: "month" } }))).json();
    expect(r.applied).toBe(false);
    expect(docs.has("payments/ref1")).toBe(false);
  });
});
