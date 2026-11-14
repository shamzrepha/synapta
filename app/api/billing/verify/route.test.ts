import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
let caller = { uid: "u1", email: "a@b.com", role: "student" };
vi.mock("@/lib/auth/requireUser", async () => {
  const errors = await import("@/lib/api/errors");
  return { requireUser: async () => caller, handleAuthError: errors.toErrorResponse };
});
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: async () => null }));

import { NextRequest } from "next/server";
import { GET } from "./route";

const tx = (over: Record<string, unknown> = {}) => ({ status: true, data: { status: "success", reference: "ref_abc123", amount: 350_000, currency: "NGN", channel: "card", customer: { email: "a@b.com" }, metadata: { uid: "u1", plan: "plus", term: "month" }, ...over } });
const paystack = (body: unknown) => vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body)));
const call = (ref = "ref_abc123") => GET(new NextRequest(`http://x/api/billing/verify?reference=${ref}`));

describe("coming back from Paystack", () => {
  beforeEach(() => {
    docs.clear();
    docs.set("users/u1", { role: "student" });
    caller = { uid: "u1", email: "a@b.com", role: "student" };
    process.env.PAYSTACK_SECRET_KEY = "sk_test_x";
  });
  afterEach(() => vi.restoreAllMocks());

  it("switches the plan on when Paystack says the payment succeeded", async () => {
    paystack(tx());
    const j = await (await call()).json();
    expect(j.data).toEqual({ paid: true, plan: "plus" });
    expect((docs.get("users/u1") as { plan: string }).plan).toBe("plus");
    expect(docs.has("payments/ref_abc123")).toBe(true);
  });
  it("does nothing when the payment is not successful", async () => {
    paystack(tx({ status: "abandoned" }));
    expect((await (await call()).json()).data.paid).toBe(false);
    expect(docs.get("users/u1")).toEqual({ role: "student" });
  });
  it("won't let one account claim another account's payment", async () => {
    paystack(tx({ metadata: { uid: "someone-else", plan: "plus", term: "month" } }));
    expect((await call()).status).toBe(403);
    expect(docs.get("users/u1")).toEqual({ role: "student" });
  });
  it("rejects a malformed reference without calling Paystack", async () => {
    const spy = paystack(tx());
    expect((await call("x")).status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });
});
