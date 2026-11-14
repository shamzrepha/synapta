import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let caller = { uid: "uid12345678", email: "a@b.com", role: "student" };
vi.mock("@/lib/auth/requireUser", async () => {
  const errors = await import("@/lib/api/errors");
  return { requireUser: async () => caller, handleAuthError: errors.toErrorResponse };
});
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: async () => null }));

import { NextRequest } from "next/server";
import { POST } from "./route";

const post = (body: unknown) => POST(new NextRequest("https://sunrootlearn.vercel.app/api/billing/checkout", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
const paystackOk = () => vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: true, data: { authorization_url: "https://checkout.paystack.com/abc" } })));
const sent = (spy: ReturnType<typeof paystackOk>) => JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body));

describe("starting a Paystack payment", () => {
  beforeEach(() => {
    caller = { uid: "uid12345678", email: "a@b.com", role: "student" };
    process.env.PAYSTACK_SECRET_KEY = "sk_test_x";
  });
  afterEach(() => vi.restoreAllMocks());

  it("asks Paystack for the exact price in kobo, in naira, with every channel, the account's details and a return link carrying the reference", async () => {
    const spy = paystackOk();
    const j = await (await post({ plan: "plus", term: "term" })).json();
    expect(j.data.url).toBe("https://checkout.paystack.com/abc");
    const b = sent(spy);
    expect(b).toMatchObject({ email: "a@b.com", amount: 1_100_000, currency: "NGN", metadata: { uid: "uid12345678", plan: "plus", term: "term" } });
    expect(b.channels).toEqual(expect.arrayContaining(["card", "bank", "ussd", "bank_transfer", "qr", "mobile_money"]));
    expect(b.reference).toMatch(/^sr_[A-Za-z0-9_.=-]+$/);
    expect(b.callback_url).toBe(`https://sunrootlearn.vercel.app/plans?paid=1&reference=${b.reference}`);
    expect((spy.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer sk_test_x" });
  });
  it("charges ₦3,500 monthly for Student Plus and ₦7,500 / ₦20,000 for Teacher", async () => {
    let spy = paystackOk();
    await post({ plan: "plus", term: "month" });
    expect(sent(spy).amount).toBe(350_000);
    vi.restoreAllMocks();
    caller = { ...caller, role: "teacher" };
    spy = paystackOk();
    await post({ plan: "teacher", term: "month" });
    expect(sent(spy).amount).toBe(750_000);
    vi.restoreAllMocks();
    spy = paystackOk();
    await post({ plan: "teacher", term: "term" });
    expect(sent(spy).amount).toBe(2_000_000);
  });
  it("keeps the Teacher plan for teacher accounts and refuses plans that can't be bought online", async () => {
    const spy = paystackOk();
    expect((await post({ plan: "teacher", term: "month" })).status).toBe(403);
    expect((await post({ plan: "school", term: "month" })).status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });
  it("says payments aren't set up when there is no key, without calling Paystack", async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    const spy = paystackOk();
    expect((await post({ plan: "plus", term: "month" })).status).toBe(503);
    expect(spy).not.toHaveBeenCalled();
  });
});
