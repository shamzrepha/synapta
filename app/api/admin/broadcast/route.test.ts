import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeDb, fakeTimestamp, type Store } from "@/lib/testing/fake-firestore";

const store: Store = new Map();
vi.mock("@/lib/firebase/admin", () => ({ Timestamp: fakeTimestamp, adminDb: () => makeFakeDb(store) }));
vi.mock("@/lib/auth/requireUser", async () => {
  const errors = await import("@/lib/api/errors");
  return { requireUser: async () => ({ uid: "admin1", role: "admin", email: "a@x.y" }), handleAuthError: errors.toErrorResponse };
});
const limited: string[] = [];
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: async (_r: unknown, o: { keyPrefix: string }) => {
    limited.push(o.keyPrefix);
    return null;
  },
}));

import { NextRequest } from "next/server";
import { POST } from "./route";

const post = (body: Record<string, unknown>) =>
  POST(new NextRequest("http://x/api/admin/broadcast", { method: "POST", body: JSON.stringify({ title: "Hello", body: "Exam week", ...body }), headers: { "content-type": "application/json" } }));

beforeEach(() => {
  store.clear();
  limited.length = 0;
  store.set("users/u1", { disabled: false, institution: "UNILAG" });
  store.set("users/u2", { disabled: false });
});

describe("admin broadcast", () => {
  it("rejects a link that leaves the app, so a broadcast cannot send learners to another site", async () => {
    for (const href of ["https://evil.example/login", "//evil.example", "javascript:alert(1)", "dashboard"]) {
      expect((await post({ href })).status, href).toBe(400);
    }
  });
  it("accepts an in-app link and delivers it", async () => {
    const r = await post({ href: "/classes/c1/past-questions?x=1" });
    expect(r.status).toBe(200);
    expect((await r.json()).data.deliveredCount).toBe(2);
  });
  it("is rate limited", async () => {
    await post({});
    expect(limited).toContain("admin_broadcast");
  });
  it("writes an audit entry for the broadcast", async () => {
    await post({});
    const logs = [...store.entries()].filter(([k]) => k.startsWith("auditLogs/"));
    expect(logs).toHaveLength(1);
    expect(logs[0][1]).toMatchObject({ actorUid: "admin1", action: "broadcast.sent", details: { deliveredCount: 2 } });
  });
});
