import { describe, it, expect, vi, beforeEach } from "vitest";
import { currentPeriod } from "./plans";

const h = vi.hoisted(() => ({ user: {} as Record<string, unknown>, enforced: true }));
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ data: () => h.user }) }) }) }),
  FieldValue: { increment: (n: number) => n },
}));
vi.mock("./config", () => ({ isEnforced: async () => h.enforced }));

import { checkFeature } from "./usage";

const used = (feature: string, n: number) => ({ featureUsage: { [currentPeriod()]: { [feature]: n } } });

describe("studio_ai and class_build limits", () => {
  beforeEach(() => {
    h.enforced = true;
    h.user = {};
  });

  it("blocks a free student past 3 Maker Studio AI builds, with a clear message", async () => {
    h.user = { role: "student", ...used("studio_ai", 3) };
    await expect(checkFeature("u", "studio_ai")).rejects.toMatchObject({ code: "PLAN_LIMIT", status: 429 });
    h.user = { role: "student", ...used("studio_ai", 2) };
    await expect(checkFeature("u", "studio_ai")).resolves.toBeUndefined();
  });

  it("an unpaid teacher gets 2 AI class builds, then is stopped", async () => {
    h.user = { role: "teacher", ...used("class_build", 1) };
    await expect(checkFeature("u", "class_build")).resolves.toBeUndefined();
    h.user = { role: "teacher", ...used("class_build", 2) };
    await expect(checkFeature("u", "class_build")).rejects.toThrow(/class build/i);
  });

  it("a student cannot start an AI class build at all", async () => {
    h.user = { role: "student" };
    await expect(checkFeature("u", "class_build")).rejects.toMatchObject({ code: "PLAN_LIMIT" });
  });

  it("nothing is blocked while billing is not enforced", async () => {
    h.enforced = false;
    h.user = { role: "student", ...used("studio_ai", 99), plan: "free" };
    await expect(checkFeature("u", "studio_ai")).resolves.toBeUndefined();
    await expect(checkFeature("u", "class_build")).resolves.toBeUndefined();
  });
});
