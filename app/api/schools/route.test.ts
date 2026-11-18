import { describe, it, expect, vi, beforeEach } from "vitest";

type Doc = Record<string, unknown>;
const store = new Map<string, Doc>();
let nextId = 1;

function matches(d: Doc, f: string, op: string, v: unknown): boolean {
  const x = d[f];
  if (op === "==") return x === v;
  if (op === "in") return (v as unknown[]).includes(x);
  if (op === "array-contains") return Array.isArray(x) && x.includes(v);
  throw new Error(`fake db: op ${op}`);
}
function applySet(path: string, data: Doc, opts?: { merge?: boolean }) {
  const prev = store.get(path) || {};
  const out: Doc = opts?.merge ? { ...prev } : {};
  for (const [k, v] of Object.entries(data)) {
    const inc = v as { __inc?: number };
    out[k] = inc && typeof inc === "object" && "__inc" in inc ? (Number(prev[k]) || 0) + (inc.__inc as number) : v;
  }
  store.set(path, out);
}
function ref(path: string): Doc {
  const [col, id] = [path.slice(0, path.lastIndexOf("/")), path.slice(path.lastIndexOf("/") + 1)];
  return {
    id,
    path,
    get: async () => ({ exists: store.has(path), id, data: () => store.get(path), ref: ref(path) }),
    set: async (d: Doc, o?: { merge?: boolean }) => applySet(path, d, o),
    collection: (c: string) => collection(`${path}/${c}`),
    _col: col,
  };
}
function collection(name: string): Doc {
  const query = (filters: Array<[string, string, unknown]>, lim = 1e9): Doc => ({
    where: (f: string, op: string, v: unknown) => query([...filters, [f, op, v]], lim),
    orderBy: () => query(filters, lim),
    limit: (n: number) => query(filters, n),
    get: async () => {
      const docs = [...store.entries()]
        .filter(([p]) => p.startsWith(`${name}/`) && !p.slice(name.length + 1).includes("/"))
        .filter(([, d]) => filters.every(([f, op, v]) => matches(d, f, op, v)))
        .slice(0, lim)
        .map(([p, d]) => ({ id: p.slice(name.length + 1), data: () => d, ref: ref(p), exists: true }));
      return { docs, empty: docs.length === 0, size: docs.length };
    },
  });
  return { ...query([]), doc: (id?: string) => ref(`${name}/${id ?? `auto${nextId++}`}`) };
}
const writes: string[] = [];
vi.mock("@/lib/firebase/admin", () => ({
  Timestamp: {
    now: () => ({ toMillis: () => Date.now(), toDate: () => new Date() }),
    fromMillis: (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) }),
  },
  FieldValue: { increment: (n: number) => ({ __inc: n }) },
  adminDb: () => ({
    collection,
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        set: (r: { path: string }, d: Doc, o?: { merge?: boolean }) => void ops.push(() => (writes.push(r.path), applySet(r.path, d, o))),
        commit: async () => void ops.forEach((f) => f()),
      };
    },
    runTransaction: async (fn: (t: unknown) => Promise<unknown>) => {
      const pending: Array<() => void> = [];
      const out = await fn({
        get: async (r: { get: () => Promise<unknown> }) => r.get(),
        set: (r: { path: string }, d: Doc, o?: { merge?: boolean }) => void pending.push(() => applySet(r.path, d, o)),
      });
      pending.forEach((f) => f());
      return out;
    },
  }),
}));

let caller = { uid: "u1", role: "student", email: "u1@x.com" };
vi.mock("@/lib/auth/requireUser", async () => {
  const errors = await import("@/lib/api/errors");
  return { requireUser: async () => caller, handleAuthError: errors.toErrorResponse };
});
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: async () => null }));

import { NextRequest } from "next/server";
import { GET, POST } from "./route";

const exp = () => ({ toMillis: () => Date.now() + 86_400_000, toDate: () => new Date() });
const post = (body: unknown) =>
  POST(new NextRequest("http://x/api/schools", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
const get = (qs = "") => GET(new NextRequest(`http://x/api/schools${qs}`));

function seed() {
  store.clear();
  writes.length = 0;
  store.set("schools/s1", { name: "Alpha High", principalUid: "p1", teacherUids: ["p1", "t1"], inviteCode: "SCH-ALPH-111111", seatLimit: 10, studentCount: 1, seatExpiresAt: exp() });
  store.set("schools/s2", { name: "Beta College", principalUid: "p2", teacherUids: ["p2"], inviteCode: "SCH-BETA-222222", seatLimit: 10, studentCount: 1, seatExpiresAt: exp() });
  store.set("users/p1", { role: "student", schoolId: "s1", displayName: "Pat Principal", email: "p1@alpha.edu", username: "pat" });
  store.set("users/t1", { role: "teacher", schoolId: "s1", displayName: "Tee", email: "t1@alpha.edu", username: "tee" });
  store.set("users/a1", { role: "student", schoolId: "s1", displayName: "Ada", email: "ada@alpha.edu", username: "ada", telemetryProfile: { predictedExamReadiness: 40 } });
  store.set("users/b1", { role: "student", schoolId: "s2", displayName: "Bob", email: "bob@beta.edu", username: "bob" });
  store.set("users/p2", { role: "student", schoolId: "s2", displayName: "Beta Principal", email: "p2@beta.edu", username: "bp" });
  store.set("users/free1", { role: "student", displayName: "Free", email: "free@x.com", username: "free1" });
  store.set("users/admin1", { role: "admin", displayName: "Boss", email: "boss@x.com", username: "boss" });
  // someone who only TYPED another school's name into their profile: they must not become a member of it
  store.set("users/typed", { role: "student", displayName: "Typed", email: "typed@x.com", username: "typed", institution: "Alpha High" });
}

describe("school portal authorization and privacy", () => {
  beforeEach(seed);

  it("a student sees their school's totals but not the roster, other students' emails or the invite code", async () => {
    caller = { uid: "a1", role: "student", email: "ada@alpha.edu" };
    const j = await (await get()).json();
    expect(j.data.mySchool.id).toBe("s1");
    expect(j.data.mySchool.isManager).toBe(false);
    expect(j.data.mySchool.roster).toEqual([]);
    expect(j.data.mySchool.inviteCode).toBeUndefined();
    expect(JSON.stringify(j)).not.toContain("@alpha.edu");
  });

  it("a principal sees the roster of their school only, and a name typed into a profile does not add anyone to it", async () => {
    caller = { uid: "p1", role: "student", email: "p1@alpha.edu" };
    const j = await (await get()).json();
    const uids = j.data.mySchool.roster.map((r: { uid: string }) => r.uid).sort();
    expect(uids).toEqual(["a1", "p1", "t1"]);
    expect(uids).not.toContain("typed");
    expect(uids).not.toContain("b1");
  });

  it("asking for another school's id never returns it", async () => {
    caller = { uid: "p1", role: "student", email: "" };
    const j = await (await get("?schoolId=s2")).json();
    expect(j.data.mySchool.id).toBe("s1");
  });

  it("a principal cannot broadcast to another school", async () => {
    caller = { uid: "p1", role: "student", email: "" };
    const res = await post({ action: "school_announce", schoolId: "s2", title: "Hello", body: "Spam" });
    expect(res.status).toBe(403);
    expect(writes.filter((w) => w.includes("notifications"))).toEqual([]);
  });

  it("a broadcast reaches exactly the members of the school, not people who typed its name", async () => {
    caller = { uid: "p1", role: "student", email: "" };
    const res = await post({ action: "school_announce", schoolId: "s1", title: "Hello", body: "Exams on Monday" });
    expect(res.status).toBe(200);
    const targets = writes.filter((w) => w.includes("/notifications/")).map((w) => w.split("/")[1]).sort();
    expect(targets).toEqual(["a1", "p1", "t1"]);
  });

  it("a plain student cannot broadcast or register members", async () => {
    caller = { uid: "a1", role: "student", email: "" };
    expect((await post({ action: "school_announce", schoolId: "s1", title: "Hi", body: "there" })).status).toBe(403);
    expect((await post({ action: "register_members", schoolId: "s1", identifiers: ["free1"] })).status).toBe(403);
  });

  it("a teacher can register students but cannot make someone a teacher", async () => {
    caller = { uid: "t1", role: "teacher", email: "" };
    expect((await post({ action: "register_members", schoolId: "s1", role: "teacher", identifiers: ["free1"] })).status).toBe(403);
    expect((await post({ action: "register_members", schoolId: "s1", role: "student", identifiers: ["free1"] })).status).toBe(200);
    expect(store.get("users/free1")).toMatchObject({ schoolId: "s1", plan: "school" });
    expect(store.get("users/free1")?.role).toBe("student");
  });

  it("registering never steals a student from another school and never demotes an admin", async () => {
    caller = { uid: "p1", role: "student", email: "" };
    const res = await post({ action: "register_members", schoolId: "s1", role: "teacher", identifiers: ["bob", "boss@x.com", "free1"] });
    expect(res.status).toBe(200);
    expect(store.get("users/b1")?.schoolId).toBe("s2");
    expect(store.get("users/admin1")?.role).toBe("admin");
    expect(store.get("users/admin1")?.schoolId).toBeUndefined();
    expect(store.get("users/free1")).toMatchObject({ schoolId: "s1", role: "teacher" });
  });

  it("registering stops at the seat limit", async () => {
    caller = { uid: "p1", role: "student", email: "" };
    store.set("schools/s1", { ...store.get("schools/s1")!, seatLimit: 10, studentCount: 10 });
    const res = await post({ action: "register_members", schoolId: "s1", identifiers: ["free1"] });
    expect(res.status).toBe(403);
    expect(store.get("users/free1")?.schoolId).toBeUndefined();
  });

  it("only a platform admin can grant seats", async () => {
    caller = { uid: "p1", role: "student", email: "" };
    expect((await post({ action: "admin_grant_seats", schoolId: "s1", seatLimit: 500 })).status).toBe(403);
  });
});

describe("one school per student", () => {
  beforeEach(seed);

  it("joining with a code puts a free student in the school and counts the seat once", async () => {
    caller = { uid: "free1", role: "student", email: "" };
    expect((await post({ action: "join_by_code", inviteCode: "sch-alph-111111" })).status).toBe(200);
    expect(store.get("users/free1")).toMatchObject({ schoolId: "s1", plan: "school" });
    expect(store.get("schools/s1")?.studentCount).toBe(2);
    // joining the same school again changes nothing
    expect((await post({ action: "join_by_code", inviteCode: "SCH-ALPH-111111" })).status).toBe(200);
    expect(store.get("schools/s1")?.studentCount).toBe(2);
  });

  it("a student who already belongs to a school cannot join a second one", async () => {
    caller = { uid: "a1", role: "student", email: "" };
    const res = await post({ action: "join_by_code", inviteCode: "SCH-BETA-222222" });
    expect(res.status).toBe(409);
    expect(store.get("users/a1")?.schoolId).toBe("s1");
    expect(store.get("schools/s2")?.studentCount).toBe(1);
  });

  it("someone who paid for a plan keeps it when they join", async () => {
    store.set("users/free1", { ...store.get("users/free1")!, plan: "pro", planExpiresAt: exp() });
    caller = { uid: "free1", role: "student", email: "" };
    await post({ action: "join_by_code", inviteCode: "SCH-ALPH-111111" });
    expect(store.get("users/free1")).toMatchObject({ schoolId: "s1", plan: "pro" });
  });

  it("a user already in a school cannot create another one (no repeat pilot licences)", async () => {
    caller = { uid: "a1", role: "student", email: "" };
    expect((await post({ action: "create_school", name: "Gamma Academy", kind: "academy", seatLimit: 50 })).status).toBe(409);
  });

  it("a full school refuses new students", async () => {
    store.set("schools/s1", { ...store.get("schools/s1")!, seatLimit: 10, studentCount: 10 });
    caller = { uid: "free1", role: "student", email: "" };
    expect((await post({ action: "join_by_code", inviteCode: "SCH-ALPH-111111" })).status).toBe(403);
  });
});

describe("validation", () => {
  beforeEach(seed);
  it("rejects oversized and malformed bodies", async () => {
    caller = { uid: "p1", role: "student", email: "" };
    expect((await post({ action: "school_announce", schoolId: "s1", title: "x".repeat(500), body: "y" })).status).toBe(400);
    expect((await post({ action: "register_members", schoolId: "s1", identifiers: [] })).status).toBe(400);
    expect((await post({ action: "nope" })).status).toBe(400);
  });
  it("public school registration caps the free pilot at 200 seats", async () => {
    const res = await post({ action: "public_register_school", name: "Delta School", kind: "secondary", contactName: "Dee", contactEmail: "d@d.com", seatLimit: 10_000 });
    expect(res.status).toBe(400);
  });
});
