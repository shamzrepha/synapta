import { describe, expect, it } from "vitest";
import { planOf, trialActive, trialEndsAt, TRIAL_DAYS } from "./plans";

const day = 86_400_000;
const later = Date.parse("2027-03-01T00:00:00Z");

describe("the 7-day free trial", () => {
  it("is 7 days from when the account was made", () => {
    const made = later;
    expect(trialEndsAt({ createdAt: made })).toBe(made + TRIAL_DAYS * day);
    expect(planOf({ createdAt: made }, made + 6 * day).id).toBe("free");
    expect(planOf({ createdAt: made }, made + 8 * day).label).toBe("Trial ended");
  });
  it("gives accounts made before the rule 7 days from the day it started", () => {
    expect(trialActive({ createdAt: Date.parse("2026-01-01T00:00:00Z") }, Date.parse("2026-11-26T00:00:00Z"))).toBe(true);
    expect(trialActive({}, Date.parse("2026-12-05T00:00:00Z"))).toBe(false);
  });
  it("never limits a paid plan, a teacher or an admin by the trial", () => {
    expect(planOf({ plan: "plus", planExpiresAt: later + 30 * day, createdAt: 1 }, later).id).toBe("plus");
    expect(planOf({ role: "teacher", createdAt: 1 }, later).label).toContain("teacher trial");
    expect(planOf({ role: "admin", createdAt: 1 }, later).id).toBe("teacher");
  });
  it("after the trial no AI on your own material is allowed", () => {
    const p = planOf({ createdAt: 1 }, later);
    expect(Object.values(p.limits).every((n) => n === 0)).toBe(true);
  });
});
