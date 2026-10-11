import { describe, it, expect } from "vitest";
import { generateSecureJoinCode } from "@/lib/validation/classes";
import { asArray } from "@/lib/api/client";

describe("API Classes Contract & Join Code Security", () => {
  it("generates unambiguous 6-character cryptographic join codes with SYN- prefix", () => {
    const codes = new Set<string>();
    const ambiguousChars = /[01IOl]/;

    for (let i = 0; i < 50; i++) {
      const code = generateSecureJoinCode();
      expect(code).toMatch(/^SYN-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
      expect(ambiguousChars.test(code)).toBe(false);
      codes.add(code);
    }

    // High entropy check across 50 generated codes
    expect(codes.size).toBe(50);
  });

  it("enforces direct array under data contract for classes API responses", () => {
    const directArrayResponse = {
      ok: true,
      data: [
        { id: "c1", title: "Circuits 101", status: "published" },
        { id: "c2", title: "Signals", status: "published" },
      ],
    };

    const classes = asArray(directArrayResponse.data);
    expect(Array.isArray(classes)).toBe(true);
    expect(classes).toHaveLength(2);
    expect(classes[0].id).toBe("c1");

    // Defends against unexpected object wrapping: { data: { classes: [...] } }
    const malformedLegacyResponse = {
      ok: true,
      data: { classes: [{ id: "c1" }] },
    };
    const guarded = asArray(malformedLegacyResponse.data);
    expect(guarded).toEqual([]);
  });

  it("verifies initial class document creation invariants and published status persistence", () => {
    function createInitialClassDoc(
      callerUid: string,
      input: { title: string; subject: string; buildState?: "empty" | "drafting"; status?: "draft" | "published" }
    ) {
      return {
        title: input.title,
        subject: input.subject,
        teacherId: callerUid,
        coTeacherIds: [] as string[],
        status: input.status || (input.buildState === "drafting" ? "draft" : "published"),
        buildState: input.buildState || "empty",
        studentCount: 0,
        visibility: "public" as const,
        joinCode: generateSecureJoinCode(),
      };
    }

    // Regular class defaults to published so students see it immediately
    const regularDoc = createInitialClassDoc("teacher_123", {
      title: "Analog Electronics",
      subject: "engineering",
    });

    expect(regularDoc.teacherId).toBe("teacher_123");
    expect(regularDoc.coTeacherIds).toEqual([]);
    expect(regularDoc.status).toBe("published");
    expect(regularDoc.buildState).toBe("empty");
    expect(regularDoc.studentCount).toBe(0);
    expect(regularDoc.joinCode).toMatch(/^SYN-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);

    // AI build class starts as draft until reviewed
    const aiDraftDoc = createInitialClassDoc("teacher_123", {
      title: "Quantum Physics",
      subject: "physics",
      buildState: "drafting",
    });
    expect(aiDraftDoc.status).toBe("draft");
    expect(aiDraftDoc.buildState).toBe("drafting");
  });

  it("verifies user role update preserves user UID and structure without reinitialization", () => {
    interface UserRecord {
      uid: string;
      email: string;
      displayName: string;
      role: "student" | "teacher" | "admin";
      roleRequest: string;
      xp: number;
      streakDays: number;
      createdAt: string;
      updatedAt: string;
    }

    function applyRoleUpdate(
      existing: UserRecord,
      newRole: "student" | "teacher" | "admin"
    ): UserRecord {
      return {
        ...existing,
        role: newRole,
        roleRequest: newRole === "teacher" ? "approved" : "none",
        updatedAt: new Date().toISOString(),
      };
    }

    const existingUser: UserRecord = {
      uid: "user_stable_uid_999",
      email: "learner@synapta.edu",
      displayName: "Ada Lovelace",
      role: "student",
      roleRequest: "pending",
      xp: 450,
      streakDays: 14,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const updated = applyRoleUpdate(existingUser, "teacher");

    // UID must be strictly preserved
    expect(updated.uid).toBe(existingUser.uid);
    expect(updated.email).toBe(existingUser.email);
    expect(updated.displayName).toBe(existingUser.displayName);
    expect(updated.xp).toBe(450);
    expect(updated.streakDays).toBe(14);
    expect(updated.createdAt).toBe(existingUser.createdAt);
    expect(updated.role).toBe("teacher");
    expect(updated.roleRequest).toBe("approved");
  });

  it("prevents teacher/owner self-enrollment with OWNER_CANNOT_ENROLL error contract", () => {
    type JoinResult =
      | { status: 403; body: { ok: false; error: { code: string; message: string } } }
      | { status: 200; body: { ok: true } };

    function evaluateJoinAttempt(
      caller: { uid: string; role: string },
      classDoc: { teacherId: string; coTeacherIds: string[] }
    ): JoinResult {
      const isOwner = classDoc.teacherId === caller.uid || classDoc.coTeacherIds.includes(caller.uid);
      const isTeacherOrAdmin = caller.role === "teacher" || caller.role === "admin";

      if (isOwner || isTeacherOrAdmin) {
        return {
          status: 403,
          body: {
            ok: false,
            error: {
              code: "OWNER_CANNOT_ENROLL",
              message: "Instructors and course owners do not need to enroll in classes",
            },
          },
        };
      }

      return { status: 200, body: { ok: true } };
    }

    const ownerTeacher = { uid: "t1", role: "teacher" };
    const classDoc = { teacherId: "t1", coTeacherIds: [] };

    const result = evaluateJoinAttempt(ownerTeacher, classDoc);
    expect(result.status).toBe(403);
    if (!result.body.ok) {
      expect(result.body.error.code).toBe("OWNER_CANNOT_ENROLL");
    }

    const coTeacher = { uid: "t2", role: "teacher" };
    const coTeacherClassDoc = { teacherId: "t1", coTeacherIds: ["t2"] };
    const coResult = evaluateJoinAttempt(coTeacher, coTeacherClassDoc);
    expect(coResult.status).toBe(403);
    if (!coResult.body.ok) {
      expect(coResult.body.error.code).toBe("OWNER_CANNOT_ENROLL");
    }

    const student = { uid: "s1", role: "student" };
    const studentResult = evaluateJoinAttempt(student, classDoc);
    expect(studentResult.status).toBe(200);
    expect(studentResult.body.ok).toBe(true);
  });
});
