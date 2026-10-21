import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyEvidence } from "./apply";
import { ApiError } from "@/lib/api/errors";

// Gamification side effects are covered by their own tests
vi.mock("@/lib/game/progress", () => ({ trackProgress: vi.fn(async () => {}) }));
vi.mock("@/lib/notifications/server", () => ({ notify: vi.fn(async () => {}) }));
vi.mock("@/lib/social/feed", () => ({ shareAchievement: vi.fn(async () => {}) }));

// In-memory Firestore mock for transaction testing
const mockDocs: Record<string, Record<string, unknown>> = {};

vi.mock("@/lib/firebase/admin", () => {
  return {
    adminDb: vi.fn(() => ({
      collection: (colName: string) => {
        if (colName === "users") {
          return {
            doc: (uid: string) => ({
              id: uid,
              path: `users/${uid}`,
            }),
          };
        }
        if (colName === "mastery") {
          return {
            doc: (id: string) => ({
              id,
              path: `mastery/${id}`,
            }),
          };
        }
        if (colName === "enrollments") {
          return { doc: (id: string) => ({ id, path: `enrollments/${id}` }) };
        }
        if (colName === "evidence") {
          return {
            doc: (id = `ev_${Date.now()}`) => ({
              id,
              path: `evidence/${id}`,
            }),
          };
        }
        if (colName === "classes") {
          return {
            doc: (classId: string) => ({
              id: classId,
              collection: (subCol: string) => {
                if (subCol === "kcs") {
                  return {
                    doc: (kcId: string) => ({
                      id: kcId,
                      path: `classes/${classId}/kcs/${kcId}`,
                    }),
                  };
                }
                return {};
              },
            }),
          };
        }
        return {};
      },
      runTransaction: vi.fn(async (updateFn: (t: FirebaseFirestore.Transaction) => Promise<unknown>) => {
        const mockTransaction = {
          get: vi.fn(async (docRef: { path: string }) => {
            const data = mockDocs[docRef.path];
            return {
              exists: !!data,
              data: () => data,
            };
          }),
          set: vi.fn((docRef: { path: string }, data: Record<string, unknown>, opts?: { merge?: boolean }) => {
            if (opts?.merge && mockDocs[docRef.path]) {
              mockDocs[docRef.path] = { ...mockDocs[docRef.path], ...data };
            } else {
              mockDocs[docRef.path] = { ...data };
            }
          }),
          update: vi.fn((docRef: { path: string }, data: Record<string, unknown>) => {
            mockDocs[docRef.path] = { ...(mockDocs[docRef.path] || {}), ...data };
          }),
        };
        return await updateFn(mockTransaction as unknown as FirebaseFirestore.Transaction);
      }),
    })),
    Timestamp: {
      now: () => ({
        toMillis: () => Date.now(),
        toDate: () => new Date(),
      }),
    },
  };
});

describe("lib/evidence/apply (A3: XP and Mastery Integrity)", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockDocs)) {
      delete mockDocs[key];
    }
    // the learner in most tests is an active student of class-1
    mockDocs["enrollments/class-1_user-1"] = { status: "active" };
  });

  describe("authorization (who may earn evidence)", () => {
    const base = { uid: "user-1", classId: "class-1", kcId: "kc-1", activity: "flashcard" as const, correct: true };
    const seedKc = () => {
      mockDocs["classes/class-1/kcs/kc-1"] = { title: "Ohm's Law", bkt: { pL0: 0.2, pT: 0.15, pG: 0.2, pS: 0.1 } };
      mockDocs["users/user-1"] = { xp: 0, streakDays: 1 };
    };

    it("lets an active student earn evidence", async () => {
      seedKc();
      const r = await applyEvidence(base);
      expect(r.xpGained).toBeGreaterThan(0);
      expect(mockDocs["mastery/user-1_kc-1"]).toBeTruthy();
    });

    it("refuses a user who is not enrolled and writes nothing (no XP, mastery or evidence)", async () => {
      seedKc();
      delete mockDocs["enrollments/class-1_user-1"];
      await expect(applyEvidence(base)).rejects.toMatchObject({ status: 403, code: "NOT_ENROLLED" });
      expect(mockDocs["mastery/user-1_kc-1"]).toBeUndefined();
      expect(mockDocs["users/user-1"]).toEqual({ xp: 0, streakDays: 1 });
    });

    it.each(["pending", "rejected", "removed"])("refuses an enrollment that is %s", async (status) => {
      seedKc();
      mockDocs["enrollments/class-1_user-1"] = { status };
      await expect(applyEvidence(base)).rejects.toMatchObject({ code: "NOT_ENROLLED" });
    });

    it("refuses every activity type for a non-member (lab, quiz, peer credit, diagnostic)", async () => {
      seedKc();
      delete mockDocs["enrollments/class-1_user-1"];
      for (const activity of ["lab", "quiz", "peer_explain"] as const) {
        await expect(applyEvidence({ ...base, activity })).rejects.toMatchObject({ code: "NOT_ENROLLED" });
      }
      await expect(applyEvidence({ ...base, activity: "quiz", metadata: { diagnostic: true } })).rejects.toMatchObject({ code: "NOT_ENROLLED" });
    });

    it("does not let enrollment in one class unlock another class", async () => {
      seedKc();
      mockDocs["classes/class-2/kcs/kc-1"] = { title: "Other", bkt: { pL0: 0.2, pT: 0.15, pG: 0.2, pS: 0.1 } };
      await expect(applyEvidence({ ...base, classId: "class-2" })).rejects.toMatchObject({ code: "NOT_ENROLLED" });
    });
  });

  it("throws 404 ApiError when target topic does not exist in class", async () => {
    // No KC in mockDocs
    await expect(
      applyEvidence({
        uid: "user-1",
        classId: "class-1",
        kcId: "kc-nonexistent",
        activity: "flashcard",
        correct: true,
      })
    ).rejects.toThrowError(ApiError);

    try {
      await applyEvidence({
        uid: "user-1",
        classId: "class-1",
        kcId: "kc-nonexistent",
        activity: "flashcard",
        correct: true,
      });
    } catch (e: unknown) {
      expect((e as ApiError).status).toBe(404);
      expect((e as ApiError).code).toBe("NOT_FOUND");
    }
  });

  it("awards +100 XP mastery achievement bonus on first-time mastery crossing and records masteryBonusAwardedAt", async () => {
    // Setup KC
    mockDocs["classes/class-1/kcs/kc-1"] = {
      title: "Ohm's Law",
      bkt: { pL0: 0.20, pT: 0.15, pG: 0.20, pS: 0.10 },
    };
    // Prior mastery is just below 0.95 threshold
    mockDocs["mastery/user-1_kc-1"] = {
      pL: 0.92,
      attempts: 5,
      correct: 4,
    };
    mockDocs["users/user-1"] = {
      xp: 200,
      streakDays: 2,
    };

    const result = await applyEvidence({
      uid: "user-1",
      classId: "class-1",
      kcId: "kc-1",
      activity: "quiz",
      correct: true,
    });

    expect(result.mastered).toBe(true);
    expect(result.crossedMasteryFirstTime).toBe(true);
    // 10 XP for correct quiz + 100 XP mastery achievement = 110 XP
    expect(result.xpGained).toBe(110);
    expect(result.totalXp).toBe(310);

    // Verify masteryBonusAwardedAt is saved
    const savedMastery = mockDocs["mastery/user-1_kc-1"];
    expect(savedMastery?.masteryBonusAwardedAt).toBeDefined();
  });

  it("does NOT award +100 XP mastery bonus again if masteryBonusAwardedAt is already present", async () => {
    mockDocs["classes/class-1/kcs/kc-1"] = {
      title: "Ohm's Law",
      bkt: { pL0: 0.20, pT: 0.15, pG: 0.20, pS: 0.10 },
    };
    // Prior mastery was lowered or dipped, but already awarded
    mockDocs["mastery/user-1_kc-1"] = {
      pL: 0.92,
      attempts: 8,
      correct: 6,
      masteryBonusAwardedAt: { toMillis: () => Date.now() - 100000 },
    };
    mockDocs["users/user-1"] = {
      xp: 500,
      streakDays: 3,
    };

    const result = await applyEvidence({
      uid: "user-1",
      classId: "class-1",
      kcId: "kc-1",
      activity: "quiz",
      correct: true,
    });

    expect(result.mastered).toBe(true);
    expect(result.crossedMasteryFirstTime).toBe(false);
    // Only standard 10 XP, no repeated 100 XP bonus!
    expect(result.xpGained).toBe(10);
    expect(result.totalXp).toBe(510);
  });

  it("enforces max 30 flashcard submissions per day per KC (throws 429 FLASHCARD_RATE_LIMITED)", async () => {
    mockDocs["classes/class-1/kcs/kc-1"] = {
      title: "Ohm's Law",
      bkt: { pL0: 0.20, pT: 0.15, pG: 0.20, pS: 0.10 },
    };
    const todayStr = new Date().toISOString().split("T")[0];
    mockDocs["mastery/user-1_kc-1"] = {
      pL: 0.50,
      lastFlashcardDate: todayStr,
      flashcardCountToday: 30,
    };

    await expect(
      applyEvidence({
        uid: "user-1",
        classId: "class-1",
        kcId: "kc-1",
        activity: "flashcard",
        correct: true,
      })
    ).rejects.toThrowError(ApiError);

    try {
      await applyEvidence({
        uid: "user-1",
        classId: "class-1",
        kcId: "kc-1",
        activity: "flashcard",
        correct: true,
      });
    } catch (e: unknown) {
      expect((e as ApiError).status).toBe(429);
      expect((e as ApiError).code).toBe("FLASHCARD_RATE_LIMITED");
    }
  });

  it("tapers flashcard correct XP from 5 to 1 after 5 submissions today to prevent XP farming", async () => {
    mockDocs["classes/class-1/kcs/kc-1"] = {
      title: "Ohm's Law",
      bkt: { pL0: 0.20, pT: 0.15, pG: 0.20, pS: 0.10 },
    };
    const todayStr = new Date().toISOString().split("T")[0];
    mockDocs["mastery/user-1_kc-1"] = {
      pL: 0.50,
      lastFlashcardDate: todayStr,
      flashcardCountToday: 5, // already answered 5 cards today
    };
    mockDocs["users/user-1"] = {
      xp: 100,
      streakDays: 1,
    };

    const result = await applyEvidence({
      uid: "user-1",
      classId: "class-1",
      kcId: "kc-1",
      activity: "flashcard",
      correct: true,
    });

    // Awarded 1 XP effort instead of +5 XP farming
    expect(result.xpGained).toBe(1);
    expect(result.totalXp).toBe(101);
  });

  it("enforces 10-minute anti-farming interval for lab submissions", async () => {
    mockDocs["classes/class-1/kcs/kc-1"] = {
      title: "Ohm's Law",
      bkt: { pL0: 0.20, pT: 0.15, pG: 0.20, pS: 0.10 },
    };
    // Completed a lab 3 minutes ago
    mockDocs["mastery/user-1_kc-1"] = {
      pL: 0.50,
      lastLabAt: { toMillis: () => Date.now() - 3 * 60 * 1000 },
    };

    try {
      await applyEvidence({
        uid: "user-1",
        classId: "class-1",
        kcId: "kc-1",
        activity: "lab",
        correct: true,
      });
      expect.unreachable("Should have thrown rate limit error");
    } catch (e: unknown) {
      expect((e as ApiError).status).toBe(429);
      expect((e as ApiError).code).toBe("LAB_RATE_LIMITED");
    }
  });
});
