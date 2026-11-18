import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeDb, fakeTimestamp, fakeFieldValue, type Store } from "@/lib/testing/fake-firestore";

const store: Store = new Map();
vi.mock("@/lib/firebase/admin", () => ({ Timestamp: fakeTimestamp, FieldValue: fakeFieldValue, adminDb: () => makeFakeDb(store) }));
let uid = "c1";
vi.mock("@/lib/auth/requireUser", async () => {
  const errors = await import("@/lib/api/errors");
  const real = await vi.importActual<typeof import("@/lib/auth/requireUser")>("@/lib/auth/requireUser");
  return { requireUser: async () => ({ uid, role: "student", email: "s@x.y", emailVerified: true }), requireVerifiedEmail: real.requireVerifiedEmail, handleAuthError: errors.toErrorResponse };
});
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: async () => null }));

import { NextRequest } from "next/server";
import { POST } from "./route";

const claim = (handle = "@rep") => POST(new NextRequest("http://x/api/referrals", { method: "POST", body: JSON.stringify({ referrerUsername: handle }), headers: { "content-type": "application/json" } }));

beforeEach(() => {
  store.clear();
  uid = "c1";
  store.set("users/rep1", { username: "rep", referralCount: 0, xp: 0 });
  for (let i = 1; i <= 12; i++) store.set(`users/c${i}`, { username: `friend${i}`, xp: 0 });
});

describe("campus referrals", () => {
  it("pays both sides once, and a second claim by the same learner is refused", async () => {
    expect((await claim()).status).toBe(200);
    expect(store.get("users/c1")).toMatchObject({ referredBy: "rep1", xp: 250 });
    expect(store.get("users/rep1")).toMatchObject({ referralCount: 1, xp: 250 });
    const again = await claim();
    expect(again.status).toBe(400);
    expect(store.get("users/rep1")).toMatchObject({ referralCount: 1, xp: 250 });
  });
  it("refuses your own handle", async () => {
    expect((await claim("@friend1")).status).toBe(400);
  });
  it("grants the 14-day exam pass exactly once, at the tenth referral", async () => {
    for (let i = 1; i <= 12; i++) {
      uid = `c${i}`;
      await claim();
    }
    const rep = store.get("users/rep1")!;
    expect(rep.referralCount).toBe(12);
    expect(rep.plan).toBe("exam");
    const notes = [...store.keys()].filter((k) => k.startsWith("users/rep1/notifications/"));
    expect(notes.filter((k) => String(store.get(k)?.title).includes("Unlocked"))).toHaveLength(1);
  });
});
