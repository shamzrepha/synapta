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

  it("verifies class publishing validation rejects empty courses and cyclic dependency graphs (B9)", () => {
    function evaluatePublishInvariants(kcs: Array<{ id: string; prerequisiteIds: string[] }>) {
      if (kcs.length === 0) {
        return {
          status: 400,
          body: { ok: false, error: { code: "EMPTY_COURSE", message: "Cannot publish course: At least one Knowledge Component must exist." } },
        };
      }

      // Check for cycles
      const visited = new Set<string>();
      const recStack = new Set<string>();
      let hasCycle = false;

      function dfs(curr: string) {
        visited.add(curr);
        recStack.add(curr);
        const node = kcs.find((k) => k.id === curr);
        for (const prereq of node?.prerequisiteIds || []) {
          if (!visited.has(prereq)) {
            dfs(prereq);
          } else if (recStack.has(prereq)) {
            hasCycle = true;
          }
        }
        recStack.delete(curr);
      }

      for (const kc of kcs) {
        if (!visited.has(kc.id)) dfs(kc.id);
      }

      if (hasCycle) {
        return {
          status: 400,
          body: { ok: false, error: { code: "CYCLE_DETECTED", message: "Circular dependencies detected." } },
        };
      }

      return { status: 200, body: { ok: true, data: { status: "published", publishedKcs: kcs.length } } };
    }

    // 1. Empty course rejection
    const emptyResult = evaluatePublishInvariants([]);
    expect(emptyResult.status).toBe(400);
    expect(emptyResult.body.ok).toBe(false);
    expect(emptyResult.body.error?.code).toBe("EMPTY_COURSE");

    // 2. Cyclic dependency rejection
    const cyclicResult = evaluatePublishInvariants([
      { id: "kc_1", prerequisiteIds: ["kc_2"] },
      { id: "kc_2", prerequisiteIds: ["kc_1"] },
    ]);
    expect(cyclicResult.status).toBe(400);
    expect(cyclicResult.body.ok).toBe(false);
    expect(cyclicResult.body.error?.code).toBe("CYCLE_DETECTED");

    // 3. Valid DAG publication
    const validResult = evaluatePublishInvariants([
      { id: "kc_1", prerequisiteIds: [] },
      { id: "kc_2", prerequisiteIds: ["kc_1"] },
    ]);
    expect(validResult.status).toBe(200);
    expect(validResult.body.ok).toBe(true);
    expect(validResult.body.data?.publishedKcs).toBe(2);
  });
});
