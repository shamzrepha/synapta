import { describe, it, expect, vi, beforeEach } from "vitest";

type Doc = Record<string, unknown>;
const store = new Map<string, Doc>();
function collection(name: string): Record<string, unknown> {
  return {
    doc: (id: string) => ({
      get: async () => ({ exists: store.has(`${name}/${id}`), data: () => store.get(`${name}/${id}`) }),
      set: async (d: Doc, o?: { merge?: boolean }) => void store.set(`${name}/${id}`, o?.merge ? { ...(store.get(`${name}/${id}`) || {}), ...d } : d),
    }),
    where: (f: string, _o: string, v: unknown) => ({
      limit: () => ({
        get: async () => ({
          docs: [...store.entries()].filter(([p, d]) => p.startsWith(`${name}/`) && d[f] === v).map(([p, d]) => ({ id: p.slice(name.length + 1), data: () => d })),
        }),
      }),
    }),
  };
}
vi.mock("@/lib/firebase/admin", () => ({ Timestamp: { now: () => ({}) }, adminDb: () => ({ collection }) }));
vi.mock("@/lib/auth/requireUser", async () => {
  const errors = await import("@/lib/api/errors");
  return { requireUser: async () => ({ uid: "u1", role: "student", email: "u@x.com" }), handleAuthError: errors.toErrorResponse };
});
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: async () => null }));

import { NextRequest } from "next/server";
import { POST } from "./route";

const call = (body: unknown) => POST(new NextRequest("http://x/api/profile/setup", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
// 1x1-ish JPEG header: starts FF D8 FF, enough for looksLikeJpeg
const jpeg = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString("base64");

describe("profile setup", () => {
  beforeEach(() => {
    store.clear();
    store.set("users/u1", { username: "temp123", profileSetup: false, photoURL: "https://g/p.jpg" });
  });

  it("saves a handle, marks the profile set up, and keeps the Google picture", async () => {
    const j = await (await call({ username: "Kay_One", avatar: { kind: "keep" } })).json();
    expect(j.ok).toBe(true);
    expect(store.get("users/u1")).toMatchObject({ username: "kay_one", profileSetup: true, photoURL: "https://g/p.jpg" });
  });

  it("takes a starter avatar or an uploaded JPEG (stored on avatars/{uid})", async () => {
    await call({ username: "kay_one", avatar: { kind: "preset", index: 2 } });
    expect(String(store.get("users/u1")?.photoURL)).toMatch(/^data:image\/svg/);
    await call({ username: "kay_one", avatar: { kind: "upload", dataUrl: jpeg } });
    expect(String(store.get("users/u1")?.photoURL)).toMatch(/^\/api\/avatar\/u1\?v=/);
    expect(store.get("avatars/u1")).toBeTruthy();
  });

  it("refuses a taken handle, a bad handle and a non-picture upload", async () => {
    store.set("users/other", { username: "taken_name" });
    expect((await call({ username: "taken_name", avatar: { kind: "keep" } })).status).toBe(409);
    expect((await call({ username: "a!", avatar: { kind: "keep" } })).status).toBe(400);
    const bad = "data:image/jpeg;base64," + Buffer.from("not a picture at all").toString("base64");
    expect((await call({ username: "kay_one", avatar: { kind: "upload", dataUrl: bad } })).status).toBe(400);
  });

  it("does not wipe school, department, level or interests an older account already has when the form leaves them out", async () => {
    store.set("users/u1", { username: "x1", institution: "Old Uni", department: "Law", level: "300L", interests: ["math"], profileSetup: true });
    await call({ username: "kay_one", avatar: { kind: "keep" } });
    expect(store.get("users/u1")).toMatchObject({ institution: "Old Uni", department: "Law", level: "300L", interests: ["math"] });
  });

  it("a school-linked account cannot change its school or department through this form", async () => {
    store.set("users/u1", { username: "x1", schoolId: "s1", institution: "Alpha High", department: "Science", profileSetup: false });
    const j = await (await call({ username: "kay_one", avatar: { kind: "keep" }, institution: "Beta College", department: "Arts", level: "SS 2" })).json();
    expect(store.get("users/u1")).toMatchObject({ institution: "Alpha High", department: "Science", level: "SS 2" });
    expect(j.data.institution).toBe("Alpha High");
  });
});
