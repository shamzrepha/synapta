import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeDb, fakeTimestamp, fakeFieldValue, type Store } from "@/lib/testing/fake-firestore";

const store: Store = new Map();
vi.mock("@/lib/firebase/admin", () => ({ Timestamp: fakeTimestamp, FieldValue: fakeFieldValue, adminDb: () => makeFakeDb(store) }));
let caller: { uid: string; role: string; email: string } | null = null;
vi.mock("@/lib/auth/requireUser", async () => {
  const errors = await import("@/lib/api/errors");
  return {
    requireUser: async () => {
      if (!caller) throw new errors.ApiError(401, "UNAUTHENTICATED", "no");
      return caller;
    },
    handleAuthError: errors.toErrorResponse,
  };
});

import { NextRequest } from "next/server";
import { GET } from "./route";
import { POST as join } from "./[id]/join/route";

const FUTO = "Federal University of Technology, Owerri (FUTO)";
const base = { teacherId: "t1", status: "published", visibility: "public", joinCode: "SYN-AAAAAA" };
const ids = async () => ((await (await GET(new NextRequest("http://x/api/classes"))).json()).data as { id: string }[]).map((c) => c.id).sort();

beforeEach(() => {
  store.clear();
  const now = Date.now();
  store.set("users/s1", { academic: { institutionId: "futo", institution: FUTO, school: "School of Electrical Systems and Engineering Technology", department: "Mechatronics Engineering", level: 300, levelSetAt: now, lockedAt: now } });
  store.set("classes/mine", { ...base, institution: "FUTO", department: "Mechatronics Engineering", levels: [300] });
  store.set("classes/other-dept", { ...base, institution: "FUTO", department: "Civil Engineering" });
  store.set("classes/other-level", { ...base, institution: "FUTO", department: "Mechatronics Engineering", levels: [200] });
  store.set("classes/other-school", { ...base, institution: "University of Lagos", department: "Mechatronics Engineering" });
  store.set("classes/open", { ...base, open: true });
  store.set("classes/nothing", { ...base });
});

describe("explore for a student who has set their course", () => {
  it("shows only their own school, department and level, and open classes", async () => {
    caller = { uid: "s1", role: "student", email: "" };
    expect(await ids()).toEqual(["mine", "open"]);
  });
  it("still shows a class they are already in", async () => {
    caller = { uid: "s1", role: "student", email: "" };
    store.set("enrollments/other-dept_s1", { uid: "s1", classId: "other-dept", status: "active" });
    expect(await ids()).toEqual(["mine", "open", "other-dept"]);
  });
  it("shows everything to a student who has not set a course yet, and to teachers", async () => {
    store.set("users/s2", {});
    caller = { uid: "s2", role: "student", email: "" };
    expect((await ids()).length).toBe(6);
    caller = { uid: "t9", role: "teacher", email: "" };
    expect((await ids()).length).toBe(6);
  });
});

describe("joining without a code", () => {
  const go = (id: string, code?: string) => join(new NextRequest(`http://x/api/classes/${id}/join`, { method: "POST", body: JSON.stringify(code ? { code } : {}) }), { params: Promise.resolve({ id }) });
  it("is refused for another department, and allowed with the lecturer's code", async () => {
    caller = { uid: "s1", role: "student", email: "s1@x.com" };
    const no = await go("other-dept");
    expect(no.status).toBe(403);
    expect((await no.json()).error.code).toBe("NOT_YOUR_COURSE");
    const yes = await go("other-dept", "SYN-AAAAAA");
    expect(yes.status).toBe(200);
  });
  it("is allowed for their own course", async () => {
    caller = { uid: "s1", role: "student", email: "s1@x.com" };
    expect((await go("mine")).status).toBe(200);
  });
});
