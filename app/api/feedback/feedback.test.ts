import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeDb, fakeTimestamp, fakeFieldValue, type Store } from "@/lib/testing/fake-firestore";

const store: Store = new Map();
vi.mock("@/lib/firebase/admin", () => ({ Timestamp: { ...fakeTimestamp, fromMillis: (n: number) => ({ toMillis: () => n }) }, FieldValue: fakeFieldValue, adminDb: () => makeFakeDb(store) }));
const notifyMany = vi.fn(async () => {});
const notify = vi.fn(async () => {});
vi.mock("@/lib/notifications/server", () => ({ notify: (...a: unknown[]) => notify(...(a as [])), notifyMany: (...a: unknown[]) => notifyMany(...(a as [])) }));
const track = vi.fn(async () => {});
vi.mock("@/lib/game/progress", () => ({ trackProgress: (...a: unknown[]) => track(...(a as [])) }));
vi.mock("@/lib/security/audit", () => ({ writeAudit: async () => {} }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: async () => null }));
let caller = { uid: "s1", role: "student", email: "s1@x.com" };
vi.mock("@/lib/auth/requireUser", async () => {
  const errors = await import("@/lib/api/errors");
  return {
    requireUser: async (_r: unknown, roles?: string[]) => {
      if (roles && !roles.includes(caller.role)) throw new errors.ApiError(403, "FORBIDDEN", "no");
      return caller;
    },
    handleAuthError: errors.toErrorResponse,
  };
});

import { NextRequest } from "next/server";
import { POST as send } from "./route";
import { POST as reward } from "../admin/feedback/[id]/reward/route";

const post = (body: unknown) => send(new NextRequest("http://x/api/feedback", { method: "POST", body: JSON.stringify(body) }));
const give = (id: string, body: unknown) => reward(new NextRequest(`http://x/api/admin/feedback/${id}/reward`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  store.clear();
  notify.mockClear(); notifyMany.mockClear(); track.mockClear();
  store.set("users/s1", { displayName: "Ada", department: "Mechatronics Engineering" });
  store.set("users/a1", { role: "admin" });
  caller = { uid: "s1", role: "student", email: "s1@x.com" };
});

describe("feedback", () => {
  it("is saved and every admin is notified", async () => {
    const r = await post({ kind: "idea", message: "Please add a dark mode for the reader" });
    expect(r.status).toBe(200);
    expect(notifyMany).toHaveBeenCalledTimes(1);
    const [uids, n] = notifyMany.mock.calls[0] as unknown as [string[], { title: string; href: string }];
    expect(uids).toEqual(["a1"]);
    expect(n.title).toContain("Ada");
    expect(n.href).toBe("/admin/feedback");
  });
  it("rejects an empty message", async () => {
    expect((await post({ kind: "bug", message: "hi" })).status).toBe(400);
  });
});

describe("rewarding feedback", () => {
  beforeEach(() => {
    store.set("feedback/f1", { uid: "s1", status: "new", message: "bug" });
    caller = { uid: "a1", role: "admin", email: "" };
  });
  it("gives XP once and tells the person", async () => {
    expect((await give("f1", { kind: "xp", amount: 250 })).status).toBe(200);
    expect(track).toHaveBeenCalledWith(expect.objectContaining({ uid: "s1", xpToAward: 250 }));
    expect(notify).toHaveBeenCalledTimes(1);
    const again = await give("f1", { kind: "xp", amount: 250 });
    expect(again.status).toBe(409);
    expect(track).toHaveBeenCalledTimes(1);
  });
  it("gives plan days by extending the Student plan", async () => {
    expect((await give("f1", { kind: "plan_days", amount: 30 })).status).toBe(200);
    const u = store.get("users/s1") as { plan: string; planExpiresAt: { toMillis: () => number } };
    expect(u.plan).toBe("plus");
    expect(u.planExpiresAt.toMillis()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
  });
  it("refuses an amount that is not on the list, and anyone who is not an admin", async () => {
    expect((await give("f1", { kind: "xp", amount: 12345 })).status).toBe(400);
    caller = { uid: "s1", role: "student", email: "" };
    expect((await give("f1", { kind: "xp", amount: 50 })).status).toBe(403);
  });
});
