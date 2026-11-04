import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { PLANS, allowance, extendedExpiry, limitMessage, planOf, priceFor } from "./plans";
import { PAYSTACK_CHANNELS, readCharge, readTransaction, verifySignature } from "./paystack";

const DAY = 86_400_000;

describe("which plan someone is on", () => {
  const now = Date.UTC(2026, 10, 4);
  it("is free by default, and a paid plan only until it expires", () => {
    expect(planOf({}, now).id).toBe("free");
    expect(planOf({ plan: "plus", planExpiresAt: now + DAY }, now).id).toBe("plus");
    expect(planOf({ plan: "plus", planExpiresAt: now - 1 }, now).id).toBe("free");
    expect(planOf({ plan: "gold", planExpiresAt: now + DAY }, now).id).toBe("free");
  });
  it("treats teachers and admins as at least Teacher, as today", () => {
    expect(planOf({ role: "teacher" }, now).id).toBe("teacher");
    expect(planOf({ role: "admin" }, now).id).toBe("teacher");
    expect(planOf({ role: "teacher", plan: "school", planExpiresAt: now + DAY }, now).id).toBe("school");
  });
});

describe("monthly allowances", () => {
  it("lets free users make 3 notes sets and then stops", () => {
    expect(allowance(PLANS.free, { notes: 2 }, "notes").ok).toBe(true);
    const a = allowance(PLANS.free, { notes: 3 }, "notes");
    expect(a.ok).toBe(false);
    expect(limitMessage(PLANS.free, "notes", a)).toContain("Upgrade to Student Plus");
  });
  it("counts scanned pages by the amount asked for", () => {
    expect(allowance(PLANS.free, { scan_pages: 13 }, "scan_pages", 3).ok).toBe(false);
    expect(allowance(PLANS.free, { scan_pages: 12 }, "scan_pages", 3).ok).toBe(true);
  });
  it("says plainly when a plan doesn't include something", () => {
    expect(limitMessage(PLANS.free, "class_build", allowance(PLANS.free, {}, "class_build"))).toContain("doesn't include");
    expect(allowance(PLANS.teacher, { notes: 99999 }, "notes").ok).toBe(true);
  });
});

describe("paying", () => {
  const body = JSON.stringify({ hello: "world" });
  it("accepts only the right signature", () => {
    const sig = crypto.createHmac("sha512", "sk_test").update(body).digest("hex");
    expect(verifySignature(body, sig, "sk_test")).toBe(true);
    expect(verifySignature(body, sig, "other")).toBe(false);
    expect(verifySignature(body + " ", sig, "sk_test")).toBe(false);
    expect(verifySignature(body, null, "sk_test")).toBe(false);
    expect(verifySignature(body, "short", "sk_test")).toBe(false);
  });
  const ok = (over: Record<string, unknown> = {}) => ({ event: "charge.success", data: { status: "success", reference: "r1", amount: priceFor("plus", "month") * 100, currency: "NGN", metadata: { uid: "u1", plan: "plus", term: "month" }, ...over } });
  it("reads a good payment", () => {
    expect(readCharge(ok({ channel: "bank_transfer", customer: { email: "a@b.com" } }))).toEqual({ reference: "r1", uid: "u1", plan: "plus", term: "month", amountKobo: 200_000, channel: "bank_transfer", email: "a@b.com" });
  });
  it("rejects underpaying, wrong currency, unknown plan, wrong event", () => {
    expect(readCharge(ok({ amount: 100 }))).toBeNull();
    expect(readCharge(ok({ currency: "USD" }))).toBeNull();
    expect(readCharge(ok({ metadata: { uid: "u1", plan: "school", term: "month" } }))).toBeNull();
    expect(readCharge({ event: "charge.failed", data: {} })).toBeNull();
    expect(readCharge(ok({ status: "failed" }))).toBeNull();
    expect(readCharge(null)).toBeNull();
  });
  it("extends from the current expiry when still running", () => {
    const now = 1_000 * DAY;
    expect(extendedExpiry(now + 10 * DAY, "month", now)).toBe(now + 40 * DAY);
    expect(extendedExpiry(now - 10 * DAY, "term", now)).toBe(now + 120 * DAY);
  });
});

describe("Paystack verify and channels", () => {
  it("reads a verified transaction the same way as a webhook, and refuses an unsuccessful one", () => {
    const tx = { status: "success", reference: "r9", amount: 650_000, currency: "NGN", channel: "card", customer: { email: "x@y.z" }, metadata: { uid: "u2", plan: "plus", term: "term" } };
    expect(readTransaction(tx)).toMatchObject({ reference: "r9", uid: "u2", term: "term", channel: "card" });
    expect(readTransaction({ ...tx, status: "abandoned" })).toBeNull();
    expect(readTransaction({ ...tx, amount: 1000 })).toBeNull();
    expect(readTransaction(undefined)).toBeNull();
  });
  it("offers every payment method Paystack supports in Nigeria", () => {
    for (const c of ["card", "bank", "ussd", "bank_transfer", "qr", "mobile_money"]) expect(PAYSTACK_CHANNELS).toContain(c);
  });
});
