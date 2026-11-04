import { describe, it, expect, vi, beforeEach } from "vitest";

const DEL = Symbol("delete");
const docs = new Map<string, Record<string, unknown>>();
function applyUpdate(path: string, patch: Record<string, unknown>) {
  const cur = { ...(docs.get(path) || {}) } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    const parts = k.split(".");
    let o = cur;
    for (const part of parts.slice(0, -1)) {
      o[part] = { ...((o[part] as Record<string, unknown>) || {}) };
      o = o[part] as Record<string, unknown>;
    }
    const last = parts[parts.length - 1];
    if (v === DEL) delete o[last];
    else o[last] = v;
  }
  docs.set(path, cur);
}
const ref = (path: string) => ({
  path,
  get: async () => ({ exists: docs.has(path), data: () => docs.get(path), id: path.split("/")[1] }),
  update: async (patch: Record<string, unknown>) => applyUpdate(path, patch),
  set: async (v: Record<string, unknown>) => void docs.set(path, v),
});
vi.mock("@/lib/firebase/admin", () => ({
  Timestamp: { now: () => ({ toMillis: () => Date.now() }), fromMillis: (ms: number) => ({ toMillis: () => ms }) },
  FieldValue: { delete: () => DEL },
  adminDb: () => ({
    collection: (c: string) => ({
      doc: (id: string) => ref(`${c}/${id}`),
      orderBy: () => ({
        limit: () => ({
          startAfter: () => ({ get: async () => ({ docs: [] }) }),
          get: async () => ({ docs: [...docs.entries()].filter(([p]) => p.startsWith("users/")).map(([p, d]) => ({ id: p.split("/")[1], data: () => d })) }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/auth/requireUser", async () => {
  const errors = await import("@/lib/api/errors");
  return { requireUser: async () => ({ uid: "admin1", role: "admin", email: "a@x.com" }), handleAuthError: errors.toErrorResponse };
});
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: async () => null }));

import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import { clearConfigCache, getBillingConfig } from "@/lib/billing/config";

const post = (body: unknown) => POST(new NextRequest("http://x/api/admin/billing/people", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
const user = (uid: string) => docs.get(`users/${uid}`) as Record<string, unknown> & { plan?: string; planExpiresAt?: { toMillis: () => number }; planGrant?: { kind: string } };
const period = new Date().toISOString().slice(0, 7);

describe("admin: people, plans, trials and test accounts", () => {
  beforeEach(() => {
    docs.clear();
    clearConfigCache();
    docs.set("users/stud", { displayName: "Ada Okafor", email: "ada@futo.edu.ng", username: "ada_o", role: "student", featureUsage: { [period]: { notes: 3 } }, monthlyTokensUsed: 900 });
    docs.set("users/teach", { displayName: "Dr Bello", email: "bello@futo.edu.ng", role: "teacher" });
  });

  it("finds a person by part of their name or email", async () => {
    const j = await (await GET(new NextRequest("http://x/api/admin/billing/people?q=okaf"))).json();
    expect(j.data.people.map((p: { name: string }) => p.name)).toEqual(["Ada Okafor"]);
    expect((await (await GET(new NextRequest("http://x/api/admin/billing/people?q=nobody"))).json()).data.people).toEqual([]);
  });
  it("gives a free subscription for the number of days asked, and records that it was a gift", async () => {
    const j = await (await post({ action: "grant", uid: "stud", plan: "pro", days: 30, kind: "gift" })).json();
    expect(j.data.person).toMatchObject({ plan: "pro", paid: true, grantKind: "gift" });
    const days = (user("stud").planExpiresAt!.toMillis() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });
  it("starts a free trial", async () => {
    await post({ action: "grant", uid: "stud", plan: "plus", days: 7, kind: "trial", note: "pilot" });
    expect(user("stud").planGrant).toMatchObject({ kind: "trial", note: "pilot" });
  });
  it("won't give a teacher plan to a student unless the admin confirms", async () => {
    const r = await post({ action: "grant", uid: "stud", plan: "teacher", days: 30, kind: "gift" });
    expect(r.status).toBe(409);
    expect((await r.json()).error.code).toBe("ROLE_MISMATCH");
    expect(user("stud").plan).toBeUndefined();
    expect((await post({ action: "grant", uid: "stud", plan: "teacher", days: 30, kind: "gift", force: true })).status).toBe(200);
    expect((await post({ action: "grant", uid: "teach", plan: "teacherpro", days: 30, kind: "gift" })).status).toBe(200);
  });
  it("turns an account into a test account: no plan, usage cleared, added to the test list; and back", async () => {
    await post({ action: "grant", uid: "stud", plan: "ultra", days: 30, kind: "gift" });
    const j = await (await post({ action: "test", uid: "stud" })).json();
    expect(j.data.person).toMatchObject({ plan: "free", paid: false, isTester: true });
    expect(user("stud").featureUsage).toEqual({});
    expect(user("stud").monthlyTokensUsed).toBe(0);
    expect((await getBillingConfig())?.testers).toEqual(["stud"]);
    const back = await (await post({ action: "untest", uid: "stud" })).json();
    expect(back.data.person.isTester).toBe(false);
  });
  it("removes a plan and resets usage", async () => {
    await post({ action: "grant", uid: "stud", plan: "pro", days: 30, kind: "gift" });
    expect((await (await post({ action: "remove", uid: "stud" })).json()).data.person).toMatchObject({ plan: "free", paid: false });
    await post({ action: "reset", uid: "stud" });
    expect(user("stud").featureUsage).toEqual({});
  });
  it("says so when the account doesn't exist", async () => {
    expect((await post({ action: "reset", uid: "ghost" })).status).toBe(404);
  });
});
