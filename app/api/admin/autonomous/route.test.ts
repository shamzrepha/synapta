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
const ai = vi.fn();
vi.mock("@/lib/ai/router", () => ({ generateWithFallback: (o: unknown) => ai(o) }));

import { NextRequest } from "next/server";
import { POST } from "./route";

const seed = (body: Record<string, unknown>) =>
  POST(new NextRequest("http://x/api/admin/autonomous", { method: "POST", body: JSON.stringify({ institution: "UNILAG", department: "Physics", level: "200L", ...body }), headers: { "content-type": "application/json" } }));
const notes = () => [...store.keys()].filter((k) => k.includes("/notifications/"));

beforeEach(() => {
  store.clear();
  limited.length = 0;
  ai.mockReset();
  store.set("users/a", { department: "Physics", institution: "UNILAG" });
  store.set("users/b", { department: "Physics", institution: "University of Lagos (UNILAG)" });
  store.set("users/c", { department: "Physics", institution: "OAU" });
  store.set("users/d", { department: "Law", institution: "UNILAG" });
});

describe("admin autonomous course seeding", () => {
  it("makes no AI call", async () => {
    await seed({});
    expect(ai).not.toHaveBeenCalled();
  });
  it("only tells students of that campus and department, not everyone in the department nationwide", async () => {
    const r = await seed({});
    expect((await r.json()).data.notifiedCount).toBe(2);
    expect(notes().sort()).toEqual([expect.stringContaining("users/a/"), expect.stringContaining("users/b/")]);
  });
  it("is rate limited, and refuses to seed the same campus and department twice", async () => {
    expect((await seed({})).status).toBe(200);
    expect(limited).toContain("admin_autonomous");
    expect((await seed({})).status).toBe(409);
  });
});
