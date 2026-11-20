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

const list = async () => ((await (await GET(new NextRequest("http://x/api/classes"))).json()).data as { id: string }[]).map((c) => c.id).sort();

beforeEach(() => {
  store.clear();
  store.set("classes/pub", { teacherId: "t1", status: "published", visibility: "public", joinCode: "SYN-AAAAAA" });
  store.set("classes/priv", { teacherId: "t1", status: "published", visibility: "private", joinCode: "SYN-BBBBBB" });
  store.set("enrollments/priv_s1", { uid: "s1", classId: "priv", status: "active" });
});

describe("GET /api/classes private classes", () => {
  it("signed-out callers see public classes only", async () => {
    caller = null;
    expect(await list()).toEqual(["pub"]);
  });
  it("a non-member does not see a private class", async () => {
    caller = { uid: "x9", role: "student", email: "" };
    expect(await list()).toEqual(["pub"]);
  });
  it("enrolled students and the teacher do", async () => {
    caller = { uid: "s1", role: "student", email: "" };
    expect(await list()).toEqual(["priv", "pub"]);
    caller = { uid: "t1", role: "teacher", email: "" };
    expect(await list()).toEqual(["priv", "pub"]);
  });
});
