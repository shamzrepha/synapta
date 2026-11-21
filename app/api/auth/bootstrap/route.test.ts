import { describe, it, expect, vi, beforeEach } from "vitest";

type Doc = Record<string, unknown>;
const store = new Map<string, Doc>();

function docRef(path: string) {
  return {
    path,
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    set: async (d: Doc, o?: { merge?: boolean }) => void store.set(path, o?.merge ? { ...(store.get(path) || {}), ...d } : d),
    update: async (d: Doc) => void store.set(path, { ...(store.get(path) || {}), ...d }),
    collection: (c: string) => collection(`${path}/${c}`),
  };
}
function collection(name: string): Record<string, unknown> {
  const q = (f?: [string, unknown]) => ({
    limit: () => q(f),
    get: async () => {
      const docs = [...store.entries()]
        .filter(([p, d]) => p.startsWith(`${name}/`) && !p.slice(name.length + 1).includes("/") && (!f || d[f[0]] === f[1]))
        .map(([p, d]) => ({ id: p.slice(name.length + 1), data: () => d }));
      return { docs, empty: docs.length === 0 };
    },
  });
  return { doc: (id: string) => docRef(`${name}/${id}`), where: (f: string, _op: string, v: unknown) => q([f, v]) };
}

let token: Record<string, unknown> = {};
vi.mock("@/lib/firebase/admin", () => ({
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
  adminDb: () => ({ collection }),
  adminAuth: () => ({ verifyIdToken: async () => token, setCustomUserClaims: async () => undefined }),
}));
vi.mock("@/lib/env", () => ({ getServerEnv: () => ({ ADMIN_EMAILS: "", TEACHER_TOKEN_LIMIT: 1, STUDENT_TOKEN_LIMIT: 1 }) }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: async () => null }));
vi.mock("@/lib/streak/server", () => ({ viewStreak: () => ({ streakDays: 1, anchor: "2026-01-01" }) }));
vi.mock("@/lib/activity/server", () => ({ recordActivityDay: async () => undefined }));

import { NextRequest } from "next/server";
import { POST } from "./route";

const call = (body: unknown = {}) =>
  POST(new NextRequest("http://x/api/auth/bootstrap", { method: "POST", body: JSON.stringify(body), headers: { authorization: "Bearer t", "content-type": "application/json" } }));

describe("bootstrap and the first-sign-in profile step", () => {
  beforeEach(() => {
    store.clear();
  });

  it("a brand-new Google account is asked for a username and a picture", async () => {
    token = { uid: "g1", email: "kay@gmail.com", name: "Kay Ode", picture: "https://x/p.jpg", email_verified: true };
    const j = await (await call({})).json();
    expect(j.data.user.profileSetup).toBe(false);
    expect(store.get("users/g1")?.profileSetup).toBe(false);
  });

  it("an email sign-up that already typed a handle is not asked again", async () => {
    token = { uid: "e1", email: "lee@x.com", email_verified: false };
    const j = await (await call({ username: "lee_one" })).json();
    expect(j.data.user.profileSetup).toBe(true);
  });

  it("an existing account without the flag is never blocked by the setup screen", async () => {
    store.set("users/old", { uid: "old", displayName: "Old Timer", username: "oldtimer", role: "student", xp: 5 });
    token = { uid: "old", email: "old@x.com", name: "Old Timer", email_verified: true };
    const j = await (await call({})).json();
    expect(j.data.user.profileSetup).toBe(true);
  });

  it("does not rename a real person whose handle contains 'alex', or overwrite a name they chose", async () => {
    store.set("users/al", { uid: "al", displayName: "Lexi (custom)", username: "alexander", role: "student", profileSetup: true });
    token = { uid: "al", email: "al@x.com", name: "Alexandra Google", email_verified: true };
    const j = await (await call({})).json();
    expect(j.data.user.username).toBe("alexander");
    expect(j.data.user.displayName).toBe("Lexi (custom)");
  });

  it("still replaces the old demo placeholder name and handle", async () => {
    store.set("users/demo", { uid: "demo", displayName: "Alex Rivera", username: "alex_rivera", role: "student" });
    token = { uid: "demo", email: "sam@x.com", name: "Sam Real", email_verified: true };
    const j = await (await call({})).json();
    expect(j.data.user.displayName).toBe("Sam Real");
    expect(j.data.user.username).not.toMatch(/rivera/);
  });
});
