import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { MONTH_DAYS, PAYABLE, PLANS, TERM_DAYS, allowance, extendedExpiry, limitMessage, planOf, priceFor, termSavingsPercent } from "./plans";
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
  it("gives admins Teacher limits, unpaid teachers a trial, and a paid plan its own limits", () => {
    expect(planOf({ role: "admin" }, now).id).toBe("teacher");
    const trial = planOf({ role: "teacher" }, now);
    expect(trial.label).toContain("teacher trial");
    expect(trial.limits.class_build).toBe(2);
    expect(planOf({ role: "teacher", plan: "teacher", planExpiresAt: now + DAY }, now).limits.class_build).toBe(25);
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
    expect(readCharge(ok({ channel: "bank_transfer", customer: { email: "a@b.com" } }))).toEqual({ reference: "r1", uid: "u1", plan: "plus", term: "month", amountKobo: 250_000, channel: "bank_transfer", email: "a@b.com" });
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

describe("the agreed prices and limits", () => {
  it("free", () => {
    expect(PLANS.free).toMatchObject({ priceMonthNgn: 0, monthlyTokens: 100_000 });
    expect(PLANS.free.limits).toEqual({ notes: 3, scan_pages: 15, lessons: 5, practice: 5, studio_ai: 3, class_build: 0 });
  });
  it("student plus", () => {
    expect(PLANS.plus).toMatchObject({ priceMonthNgn: 2_500, priceTermNgn: 6_000, monthlyTokens: 1_200_000 });
    expect(PLANS.plus.limits).toEqual({ notes: 50, scan_pages: 400, lessons: 80, practice: 80, studio_ai: 40, class_build: 0 });
    expect(priceFor("plus", "month") * 100).toBe(250_000);
    expect(priceFor("plus", "term") * 100).toBe(600_000);
  });
  it("teacher", () => {
    expect(PLANS.teacher).toMatchObject({ priceMonthNgn: 7_500, priceTermNgn: 20_000, monthlyTokens: 15_000_000 });
    expect(PLANS.teacher.limits).toEqual({ notes: Infinity, scan_pages: 1_500, lessons: Infinity, practice: Infinity, studio_ai: 150, class_build: 25 });
    expect(priceFor("teacher", "month") * 100).toBe(750_000);
    expect(priceFor("teacher", "term") * 100).toBe(2_000_000);
  });
  it("school is invoiced per student", () => {
    expect(PLANS.school.perSeatTermNgn).toBe(1_200);
    expect(PAYABLE).toEqual(["plus", "teacher"]);
  });
  it("a semester is 120 days and a month 30", () => {
    expect(TERM_DAYS).toBe(120);
    expect(MONTH_DAYS).toBe(30);
  });
  it("shows the real saving for paying by the semester", () => {
    expect(termSavingsPercent(PLANS.plus)).toBe(40);
    expect(termSavingsPercent(PLANS.teacher)).toBe(33);
    expect(termSavingsPercent(PLANS.free)).toBe(0);
  });
  it("won't accept a student plus payment of the old price", () => {
    const old = { event: "charge.success", data: { status: "success", reference: "r2", amount: 200_000, currency: "NGN", metadata: { uid: "u", plan: "plus", term: "month" } } };
    expect(readCharge(old)).toBeNull();
  });
});
