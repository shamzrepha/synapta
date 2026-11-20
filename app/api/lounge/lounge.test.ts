import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeDb, fakeTimestamp, fakeFieldValue, type Store } from "@/lib/testing/fake-firestore";

const store: Store = new Map();
vi.mock("@/lib/firebase/admin", () => ({ Timestamp: fakeTimestamp, FieldValue: fakeFieldValue, adminDb: () => makeFakeDb(store) }));
let uid = "s1";
vi.mock("@/lib/auth/requireUser", async () => {
  const errors = await import("@/lib/api/errors");
  return { requireUser: async () => ({ uid, role: "student", email: `${uid}@x.com` }), handleAuthError: errors.toErrorResponse };
});

import { NextRequest } from "next/server";
import { POST as match } from "./match/route";
import { GET as listRooms, POST as createRoom } from "./rooms/route";
import { GET as getRoom, POST as joinRoom } from "./rooms/[roomCode]/route";

const json = (url: string, body: unknown) => new NextRequest(`http://x${url}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const ctx = (roomCode: string) => ({ params: Promise.resolve({ roomCode }) });

beforeEach(() => {
  store.clear();
  uid = "s1";
  store.set("classes/c1", { teacherId: "t1", status: "published", visibility: "public" });
  store.set("classes/c2", { teacherId: "t2", status: "published", visibility: "public" });
  for (const u of ["s1", "s2"]) store.set(`enrollments/c1_${u}`, { uid: u, classId: "c1", status: "active" });
  store.set("enrollments/c2_s3", { uid: "s3", classId: "c2", status: "active" });
  store.set("users/s1", { displayName: "Ada", email: "s1@x.com" });
  store.set("users/s2", { displayName: "Bo", username: "bo", email: "secret@x.com", xp: 900 });
  store.set("users/s3", { displayName: "Cy", email: "cy@x.com" });
  store.set("mastery/m1", { uid: "s2", classId: "c1", kcId: "k1", pL: 0.99 });
});

describe("study lounge access", () => {
  it("match refuses a class the caller is not in", async () => {
    uid = "s3";
    expect((await match(json("/api/lounge/match", { classId: "c1", kcId: "k1" }))).status).toBe(403);
  });
  it("match returns classmates with a band and no email, xp or exact score", async () => {
    const res = await match(json("/api/lounge/match", { classId: "c1", kcId: "k1" }));
    const text = JSON.stringify(await res.json());
    expect(text).toContain("Bo");
    expect(text).not.toContain("@x.com");
    expect(text).toContain('"band":"strong"');
    expect(text).not.toContain("xp");
    expect(text).not.toContain("pL");
  });
  it("cannot create a room in a foreign class or invite a non-classmate", async () => {
    uid = "s3";
    expect((await createRoom(json("/api/lounge/rooms", { title: "T", classId: "c1" }))).status).toBe(403);
    uid = "s1";
    expect((await createRoom(json("/api/lounge/rooms", { title: "T", classId: "c1", invitedUids: ["s3"] }))).status).toBe(403);
    expect((await createRoom(json("/api/lounge/rooms", { title: "T", classId: "c1", invitedUids: ["s2"] }))).status).toBe(200);
  });
  it("lists only my rooms, GET never joins, POST joins with class access", async () => {
    const made = await (await createRoom(json("/api/lounge/rooms", { title: "T", classId: "c1" }))).json();
    const code = made.data.roomCode as string;
    uid = "s3";
    expect(((await (await listRooms(new NextRequest("http://x/api/lounge/rooms"))).json()).data as unknown[]).length).toBe(0);
    expect((await getRoom(new NextRequest("http://x"), ctx(code))).status).toBe(403);
    expect((store.get(`rooms/${code}`)?.memberIds as string[]).includes("s3")).toBe(false);
    expect((await joinRoom(new NextRequest("http://x", { method: "POST" }), ctx(code))).status).toBe(403);
    uid = "s2";
    expect((await joinRoom(new NextRequest("http://x", { method: "POST" }), ctx(code))).status).toBe(200);
    expect((await getRoom(new NextRequest("http://x"), ctx(code))).status).toBe(200);
  });
});
