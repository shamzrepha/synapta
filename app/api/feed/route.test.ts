import { describe, it, expect, vi, beforeEach } from "vitest";

type Doc = Record<string, unknown>;
const store = new Map<string, Doc>();
const queries: Array<Array<[string, unknown]>> = [];

function collection(name: string): Record<string, unknown> {
  const q = (filters: Array<[string, unknown]>): Record<string, unknown> => ({
    where: (f: string, _o: string, v: unknown) => q([...filters, [f, v]]),
    orderBy: () => q(filters),
    startAfter: () => q(filters),
    limit: () => q(filters),
    get: async () => {
      queries.push(filters);
      const docs = [...store.entries()]
        .filter(([p, d]) => p.startsWith(`${name}/`) && filters.every(([f, v]) => d[f] === v))
        .map(([p, d]) => ({ id: p.slice(name.length + 1), data: () => d }));
      return { docs };
    },
  });
  return { ...q([]), doc: (id: string) => ({ get: async () => ({ exists: store.has(`${name}/${id}`), data: () => store.get(`${name}/${id}`) }), collection: () => q([]) }) };
}
vi.mock("@/lib/firebase/admin", () => ({
  Timestamp: { now: () => ({}), fromDate: (d: Date) => d },
  adminDb: () => ({ collection }),
}));
vi.mock("@/lib/auth/requireUser", async () => {
  const errors = await import("@/lib/api/errors");
  return { requireUser: async () => ({ uid: "me", role: "student", email: "" }), requireVerifiedEmail: () => undefined, handleAuthError: errors.toErrorResponse };
});
vi.mock("@/lib/auth/classAccess", () => ({ assertClassAccess: async () => ({}) }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: async () => null }));
vi.mock("@/lib/social/feed", () => ({
  createPost: async () => "p",
  serializePost: (id: string, d: Doc) => ({ id, ...d }),
  withViewerState: async (p: unknown[]) => p,
}));
vi.mock("@/lib/game/progress", () => ({ trackProgress: async () => undefined }));
vi.mock("@/lib/chat/store", async () => ({ attachmentSchema: (await import("zod")).z.any() }));

import { NextRequest } from "next/server";
import { GET } from "./route";

const get = (qs: string) => GET(new NextRequest(`http://x/api/feed?${qs}`));

describe("campus feed", () => {
  beforeEach(() => {
    store.clear();
    queries.length = 0;
    store.set("posts/a", { schoolId: "s1", visibility: "public", text: "alpha" });
    store.set("posts/b", { schoolId: "s2", visibility: "public", text: "beta" });
    store.set("posts/c", { schoolId: "s1", visibility: "class", text: "alpha class-only" });
  });

  it("returns only public posts of the caller's own school, queried by school id", async () => {
    store.set("users/me", { schoolId: "s1", institution: "Alpha High" });
    const j = await (await get("scope=school")).json();
    expect(j.data.posts.map((p: { id: string }) => p.id)).toEqual(["a"]);
    expect(queries[0]).toContainEqual(["schoolId", "s1"]);
  });

  it("typing a school's name into a profile does not open that school's feed", async () => {
    store.set("users/me", { institution: "Alpha High" });
    const j = await (await get("scope=school")).json();
    expect(j.data.posts).toEqual([]);
  });

  it("a garbage cursor is a 400, not a 500", async () => {
    expect((await get("scope=global&before=not-a-date")).status).toBe(400);
  });
});
