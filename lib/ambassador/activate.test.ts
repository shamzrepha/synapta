import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeDb, fakeTimestamp, fakeFieldValue, type Store } from "@/lib/testing/fake-firestore";

const store: Store = new Map();
vi.mock("@/lib/firebase/admin", () => ({ Timestamp: fakeTimestamp, FieldValue: fakeFieldValue, adminDb: () => makeFakeDb(store) }));

import { activatePayment } from "@/lib/billing/activate";

const charge = (reference: string, amountKobo = 150_000) => ({ reference, uid: "stu", plan: "plus" as const, term: "month" as const, amountKobo, channel: "card", email: "s@x.y" });

beforeEach(() => {
  store.clear();
  store.set("users/amb", { username: "amb" });
  store.set("users/stu", { username: "stu", referredBy: "amb", displayName: "Stu" });
});

describe("ambassador commission on a payment", () => {
  it("records 20% of the first payment, held for 7 days, and counts one paying student", async () => {
    expect(await activatePayment(charge("r1"))).toBe(true);
    const c = store.get("commissions/r1")!;
    expect(c).toMatchObject({ ambassadorUid: "amb", commissionNgn: 300, status: "held", nth: 1 });
    expect(store.get("users/amb")!.payingReferrals).toBe(1);
  });
  it("pays 10% on the second payment and does not count the student twice", async () => {
    await activatePayment(charge("r1"));
    await activatePayment(charge("r2"));
    expect(store.get("commissions/r2")).toMatchObject({ commissionNgn: 150, nth: 2 });
    expect(store.get("users/amb")!.payingReferrals).toBe(1);
  });
  it("is applied once per payment reference", async () => {
    await activatePayment(charge("r1"));
    expect(await activatePayment(charge("r1"))).toBe(false);
    expect(store.get("users/amb")!.payingReferrals).toBe(1);
  });
  it("writes nothing for someone who joined without a link", async () => {
    store.set("users/stu", { username: "stu" });
    await activatePayment(charge("r1"));
    expect(store.has("commissions/r1")).toBe(false);
  });
});
