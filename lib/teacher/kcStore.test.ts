import { describe, it, expect, vi, beforeEach } from "vitest";
import { createKc, updateKc, upsertAiKc } from "./kcStore";

const mockStore: Record<string, Record<string, unknown>> = {};

vi.mock("@/lib/firebase/admin", () => {
  return {
    Timestamp: {
      now: vi.fn(() => ({ toMillis: () => 1700000000000, toDate: () => new Date() })),
    },
    adminDb: vi.fn(() => ({
      collection: (colName: string) => {
        if (colName === "classes") {
          return {
            doc: (classId: string) => ({
              id: classId,
              collection: (subCol: string) => {
                if (subCol === "kcs") {
                  return {
                    doc: (kcId?: string) => {
                      const id = kcId || `kc_${Object.keys(mockStore).length + 1}`;
                      const path = `classes/${classId}/kcs/${id}`;
                      return {
                        id,
                        path,
                        set: vi.fn(async (data: Record<string, unknown>) => {
                          mockStore[path] = { ...data, id };
                        }),
                        update: vi.fn(async (data: Record<string, unknown>) => {
                          mockStore[path] = { ...mockStore[path], ...data };
                        }),
                        get: vi.fn(async () => ({
                          exists: !!mockStore[path],
                          id,
                          data: () => mockStore[path],
                        })),
                      };
                    },
                    where: (field: string, op: string, val: unknown) => ({
                      limit: (num: number) => ({
                        get: vi.fn(async () => {
                          const prefix = `classes/${classId}/kcs/`;
                          const matches = Object.entries(mockStore)
                            .filter(([p, data]) => p.startsWith(prefix) && data[field] === val)
                            .slice(0, num)
                            .map(([p, data]) => ({
                              id: (data.id as string) || p.replace(prefix, ""),
                              data: () => data,
                              ref: {
                                update: vi.fn(async (updateData: Record<string, unknown>) => {
                                  mockStore[p] = { ...mockStore[p], ...updateData };
                                }),
                              },
                            }));
                          return {
                            empty: matches.length === 0,
                            docs: matches,
                          };
                        }),
                      }),
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
    })),
  };
});

describe("lib/teacher/kcStore", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStore)) {
      delete mockStore[key];
    }
  });

  it("createKc validates schema, assigns default BKT parameters, and persists KC", async () => {
    const created = await createKc("class_101", {
      title: "Newton's Second Law",
      description: "Force equals mass times acceleration (F = ma).",
      difficulty: "intermediate",
    });

    expect(created.id).toBeDefined();
    expect(created.title).toBe("Newton's Second Law");
    expect(created.slug).toBe("newtons-second-law");
    expect(created.bkt.pL0).toBe(0.2);
    expect(created.bkt.pG + created.bkt.pS).toBeLessThan(1.0);
    expect(mockStore[`classes/class_101/kcs/${created.id}`]).toBeDefined();
  });

  it("updateKc applies sanitized updates and timestamps to an existing KC", async () => {
    mockStore["classes/class_101/kcs/kc_existing"] = {
      id: "kc_existing",
      classId: "class_101",
      title: "Ohm's Law",
      description: "V = IR",
      bkt: { pL0: 0.1, pT: 0.2, pG: 0.15, pS: 0.1 },
    };

    await updateKc("class_101", "kc_existing", {
      description: "Voltage equals current multiplied by resistance (V = IR).",
      bkt: { pL0: 0.2, pT: 0.3, pG: 0.2, pS: 0.1 },
    });

    const updated = mockStore["classes/class_101/kcs/kc_existing"];
    expect(updated.description).toBe("Voltage equals current multiplied by resistance (V = IR).");
    expect((updated.bkt as { pL0: number }).pL0).toBe(0.2);
    expect(updated.updatedAt).toBeDefined();
  });

  it("upsertAiKc deduplicates by slug and updates existing KC without regenerating ID", async () => {
    // Initial creation via upsert
    const first = await upsertAiKc("class_101", {
      title: "Kinematics 101",
      description: "Motion in one dimension",
    });
    expect(first.id).toBeDefined();

    // Upsert with matching title/slug should update the existing record
    const second = await upsertAiKc("class_101", {
      title: "Kinematics 101",
      description: "Motion in one dimension with constant acceleration",
      difficulty: "introductory",
    });

    expect(second.id).toBe(first.id);
    expect(second.description).toBe("Motion in one dimension with constant acceleration");
  });
});
