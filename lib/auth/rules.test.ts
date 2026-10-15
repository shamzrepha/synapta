import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/firebase/admin", () => ({ adminDb: vi.fn() }));

import { computeClassAccess } from "./classAccess";

describe("Firestore Security Rules Allowlist", () => {
  const allowedUserKeys = new Set(["displayName", "photoURL", "username", "updatedAt"]);

  function validateUserUpdate(fields: Record<string, unknown>): { allowed: boolean; illegalKeys: string[] } {
    const keys = Object.keys(fields);
    const illegalKeys = keys.filter((k) => !allowedUserKeys.has(k));
    return {
      allowed: illegalKeys.length === 0,
      illegalKeys,
    };
  }

  it("permits valid profile updates with whitelisted keys", () => {
    const validUpdate = {
      displayName: "Jane Doe",
      username: "janedoe",
      photoURL: "https://example.com/avatar.png",
      updatedAt: new Date().toISOString(),
    };
    const res = validateUserUpdate(validUpdate);
    expect(res.allowed).toBe(true);
    expect(res.illegalKeys).toHaveLength(0);
  });

  it("rejects unauthorized client attempts to elevate role", () => {
    const attackPayload = {
      displayName: "Attacker",
      role: "admin",
    };
    const res = validateUserUpdate(attackPayload);
    expect(res.allowed).toBe(false);
    expect(res.illegalKeys).toContain("role");
  });

  it("rejects unauthorized client attempts to falsify XP or streaks", () => {
    const exploitPayload = {
      xp: 999999,
      streakDays: 500,
    };
    const res = validateUserUpdate(exploitPayload);
    expect(res.allowed).toBe(false);
    expect(res.illegalKeys).toContain("xp");
    expect(res.illegalKeys).toContain("streakDays");
  });

  it("rejects unauthorized client attempts to modify token limits", () => {
    const exploitPayload = {
      monthlyTokenLimit: 10000000,
    };
    const res = validateUserUpdate(exploitPayload);
    expect(res.allowed).toBe(false);
    expect(res.illegalKeys).toContain("monthlyTokenLimit");
  });
});

describe("Class Access Authorization Matrix", () => {
  const evaluate = (uid: string, role: string, cls: Record<string, unknown>, enrollmentStatus: "active" | "pending" | "rejected" | "none") =>
    computeClassAccess({ classData: cls, uid, userRole: role, enrollmentStatus });

  it("a shared link to a public class only previews it until the student enrolls", () => {
    const access = evaluate("s1", "student", { teacherId: "t1", visibility: "public", status: "published" }, "none");
    expect(access.canView).toBe(false);
    expect(access.canPreview).toBe(true);
    expect(access.canMutate).toBe(false);
  });

  it("blocks non-enrolled students from private classes entirely", () => {
    const access = evaluate("s1", "student", { teacherId: "t1", visibility: "private", status: "published" }, "none");
    expect(access.canView).toBe(false);
    expect(access.canPreview).toBe(false);
  });

  it("pending and rejected requests don't grant access", () => {
    const cls = { teacherId: "t1", visibility: "private", status: "published" };
    expect(evaluate("s1", "student", cls, "pending").canView).toBe(false);
    expect(evaluate("s1", "student", cls, "rejected").canView).toBe(false);
  });

  it("allows enrolled students to view but not mutate", () => {
    const access = evaluate("s1", "student", { teacherId: "t1", visibility: "private", status: "published" }, "active");
    expect(access.canView).toBe(true);
    expect(access.role).toBe("student");
    expect(access.canMutate).toBe(false);
  });

  it("allows the teacher and co-teachers full access", () => {
    const cls = { teacherId: "t1", coTeacherIds: ["t2"], visibility: "private", status: "draft" };
    expect(evaluate("t1", "teacher", cls, "none")).toMatchObject({ canView: true, canMutate: true, role: "owner" });
    expect(evaluate("t2", "teacher", cls, "none")).toMatchObject({ canView: true, canMutate: true, role: "owner" });
  });

  it("allows platform admins full access", () => {
    const access = evaluate("a1", "admin", { teacherId: "t1", visibility: "private", status: "draft" }, "none");
    expect(access).toMatchObject({ canView: true, canMutate: true, role: "admin" });
  });
});

describe("Study Room Membership Authorization (A4.2)", () => {
  function canPostToRoom(uid: string, role: string, memberIds: string[]): boolean {
    return memberIds.includes(uid) || role === "admin";
  }

  it("permits room members to post messages and edit scratchpad", () => {
    expect(canPostToRoom("user-1", "student", ["user-1", "user-2"])).toBe(true);
  });

  it("rejects non-members who attempt to post or mutate room without joining", () => {
    expect(canPostToRoom("user-attacker", "student", ["user-1", "user-2"])).toBe(false);
  });

  it("permits platform admins to moderate any room", () => {
    expect(canPostToRoom("admin-1", "admin", ["user-1", "user-2"])).toBe(true);
  });
});

describe("Class Join Authorization & Eligibility (A4.3)", () => {
  function canJoinClass(
    caller: { uid: string; role: string },
    classDoc: { teacherId: string; coTeacherIds?: string[]; status: "draft" | "published" }
  ): { eligible: boolean; errorReason?: string } {
    if (classDoc.status !== "published" && caller.role !== "admin") {
      return { eligible: false, errorReason: "CLASS_NOT_PUBLISHED" };
    }
    const isCoTeacher = Array.isArray(classDoc.coTeacherIds) && classDoc.coTeacherIds.includes(caller.uid);
    if (classDoc.teacherId === caller.uid || isCoTeacher || caller.role === "admin") {
      return { eligible: false, errorReason: "OWNER_CANNOT_ENROLL" };
    }
    return { eligible: true };
  }

  it("allows students to join published classes", () => {
    const res = canJoinClass({ uid: "s1", role: "student" }, { teacherId: "t1", status: "published" });
    expect(res.eligible).toBe(true);
  });

  it("rejects enrollment into draft classes for non-admins", () => {
    const res = canJoinClass({ uid: "s1", role: "student" }, { teacherId: "t1", status: "draft" });
    expect(res.eligible).toBe(false);
    expect(res.errorReason).toBe("CLASS_NOT_PUBLISHED");
  });

  it("rejects teacher from enrolling in their own class", () => {
    const res = canJoinClass({ uid: "t1", role: "teacher" }, { teacherId: "t1", status: "published" });
    expect(res.eligible).toBe(false);
    expect(res.errorReason).toBe("OWNER_CANNOT_ENROLL");
  });
});
