import { describe, it, expect } from "vitest";
import { makeFakeDb, type Store } from "@/lib/testing/fake-firestore";
import { deleteUserData, findOwnedClasses, pseudonym } from "./delete-user";

function seed(): Store {
  const s: Store = new Map();
  const set = (p: string, v: Record<string, unknown>) => void s.set(p, v);
  set("users/u1", { username: "ada" });
  set("users/u2", { username: "bob" });
  set("users/u1/friends/u2", {});
  set("users/u2/friends/u1", {});
  set("users/u1/notifications/n1", {});
  set("users/u1/pushTokens/t1", { token: "x" });
  set("mastery/u1_kc1", { uid: "u1" });
  set("mastery/u2_kc1", { uid: "u2" });
  for (let i = 0; i < 950; i++) set(`evidence/e${i}`, { uid: "u1" });
  set("evidence/other", { uid: "u2" });
  set("studyNotes/n1", { uid: "u1" });
  set("studyNotes/n1/versions/1", { markdown: "hi" });
  set("studyNotes/n2", { uid: "u2" });
  set("notebooks/nb1", { ownerUid: "u1" });
  set("posts/p1", { authorUid: "u1" });
  set("posts/p2", { authorUid: "u2" });
  set("avatars/u1", { data: "x" });
  set("learnerProfiles/u1", {});
  set("enrollments/c1_u1", { uid: "u1" });
  set("friend_requests/r1", { fromUid: "u1", toUid: "u2" });
  set("payments/ref1", { reference: "ref1", uid: "u1", email: "a@b.c", name: "Ada", plan: "pro", term: "month", amountKobo: 100 });
  set("classes/c9", { teacherId: "u1", name: "Maths" });
  return s;
}

describe("deleteUserData", () => {
  it("dry run changes nothing and reports counts", async () => {
    const s = seed();
    const before = s.size;
    const r = await deleteUserData(makeFakeDb(s), "u1", { dryRun: true });
    expect(s.size).toBe(before);
    expect(r.dryRun).toBe(true);
    expect(r.counts.mastery).toBe(1);
    expect(r.counts.users).toBe(1);
  });

  it("deletes the user's data across collections and leaves other users alone", async () => {
    const s = seed();
    const r = await deleteUserData(makeFakeDb(s), "u1");
    expect(r.errors).toEqual([]);
    expect([...s.keys()].filter((k) => k.startsWith("evidence/") && s.get(k)?.uid === "u1")).toEqual([]);
    for (const gone of ["users/u1", "users/u1/friends/u2", "users/u2/friends/u1", "mastery/u1_kc1", "studyNotes/n1", "studyNotes/n1/versions/1", "notebooks/nb1", "posts/p1", "avatars/u1", "learnerProfiles/u1", "enrollments/c1_u1", "friend_requests/r1", "users/u1/pushTokens/t1"]) {
      expect(s.has(gone), gone).toBe(false);
    }
    for (const kept of ["users/u2", "mastery/u2_kc1", "evidence/other", "studyNotes/n2", "posts/p2", "classes/c9"]) expect(s.has(kept), kept).toBe(true);
    expect(r.counts.evidence).toBe(950);
  });

  it("keeps payments but strips personal fields", async () => {
    const s = seed();
    await deleteUserData(makeFakeDb(s), "u1");
    const p = s.get("payments/ref1")!;
    expect(p.uid).toBe(pseudonym("u1"));
    expect(p.email).toBeUndefined();
    expect(p.name).toBeUndefined();
    expect(p.amountKobo).toBe(100);
  });

  it("is idempotent", async () => {
    const s = seed();
    const db = makeFakeDb(s);
    await deleteUserData(db, "u1");
    const size = s.size;
    const r = await deleteUserData(db, "u1");
    expect(s.size).toBe(size);
    expect(r.errors).toEqual([]);
  });

  it("keeps the profile when a step fails, so the run can be retried", async () => {
    const s = seed();
    const db = makeFakeDb(s);
    const real = db.collection;
    db.collection = (name: string) => {
      if (name === "mindMaps") throw new Error("boom");
      return real(name);
    };
    const r = await deleteUserData(db, "u1");
    expect(r.errors[0]).toContain("mindMaps");
    expect(s.has("users/u1")).toBe(true);
  });

  it("rejects a malformed uid", async () => {
    await expect(deleteUserData(makeFakeDb(new Map()), "a/b")).rejects.toThrow();
  });

  it("finds classes the user teaches", async () => {
    expect(await findOwnedClasses(makeFakeDb(seed()), "u1")).toEqual([{ id: "c9", name: "Maths" }]);
    expect(await findOwnedClasses(makeFakeDb(seed()), "u2")).toEqual([]);
  });
});
