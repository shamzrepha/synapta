import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, Record<string, unknown>>();
vi.mock("@/lib/firebase/admin", () => ({
  Timestamp: { now: () => ({ toDate: () => new Date() }) },
  adminDb: () => ({
    getAll: async () => [],
    collection: (c: string) => ({
      doc: (id: string) => ({ get: async () => ({ exists: store.has(`${c}/${id}`), data: () => store.get(`${c}/${id}`) }), set: async (v: Record<string, unknown>) => void store.set(`${c}/${id}`, v) }),
      where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }),
    }),
  }),
}));
vi.mock("@/lib/auth/requireUser", async () => {
  const errors = await import("@/lib/api/errors");
  return { requireUser: async () => ({ uid: "u1", role: "student", email: "a@b.c" }), handleAuthError: errors.toErrorResponse };
});
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: async () => null }));
vi.mock("@/lib/quota/guard", () => ({ checkRateLimitAndQuota: async () => ({}) }));
const ai = vi.fn();
vi.mock("@/lib/ai/router", () => ({ generateWithFallback: (o: unknown) => ai(o) }));
let mistakes: Array<Record<string, unknown>> = [];
vi.mock("@/lib/mistakes/store", () => ({ listMistakes: async () => mistakes }));

import { NextRequest } from "next/server";
import { GET, POST } from "./route";

const post = (body: unknown = {}) => POST(new NextRequest("http://x/api/study/evaluation", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
const mk = (over: Record<string, unknown> = {}) => ({ topic: "Ohm's law", classId: "c1", kcId: "k1", classTitle: "Physics", question: "V?", studentAnswer: "1.5", correctAnswer: "6", wrongCount: 2, mastered: false, ...over });
const goodAi = { headline: "Ohm's law needs work", strengths: [], gaps: [{ topic: "Ohm's law", misunderstanding: "divides instead of multiplies", severity: 3 }], plan: [{ title: "Redo", action: "Retest them", topic: "Ohm's law", tool: "retest", minutes: 15 }], encouragement: "Keep going" };

describe("evaluating a learner", () => {
  beforeEach(() => {
    store.clear();
    ai.mockReset();
    mistakes = [mk()];
  });

  it("says there isn't enough yet, without calling the AI, when the learner has done nothing", async () => {
    mistakes = [];
    const j = await (await post()).json();
    expect(j.data).toMatchObject({ enough: false, evaluation: null });
    expect(ai).not.toHaveBeenCalled();
  });
  it("asks the AI under its own task, keeps the result, and links each step to a real page", async () => {
    ai.mockResolvedValue({ data: goodAi });
    const j = await (await post()).json();
    expect(ai.mock.calls[0][0]).toMatchObject({ task: "student_evaluation" });
    expect(j.data.evaluation.headline).toBe("Ohm's law needs work");
    expect(j.data.evaluation.plan[0].href).toBe("/study/mistakes");
    expect(store.get("evaluations/u1")).toMatchObject({ usedAi: true });
  });
  it("returns the saved one at no cost while nothing has changed, and only calls the AI again when asked or when the evidence changed", async () => {
    ai.mockResolvedValue({ data: goodAi });
    await post();
    const again = await (await post()).json();
    expect(again.data.cached).toBe(true);
    expect(ai).toHaveBeenCalledTimes(1);
    await post({ force: true });
    expect(ai).toHaveBeenCalledTimes(2);
    mistakes = [mk(), mk({ question: "a new wrong answer" })];
    await post();
    expect(ai).toHaveBeenCalledTimes(3);
  });
  it("GET shows the saved evaluation and flags it as out of date after new wrong answers", async () => {
    ai.mockResolvedValue({ data: goodAi });
    await post();
    expect((await (await GET(new NextRequest("http://x/api/study/evaluation"))).json()).data.stale).toBe(false);
    mistakes = [mk(), mk({ question: "another" })];
    expect((await (await GET(new NextRequest("http://x/api/study/evaluation"))).json()).data.stale).toBe(true);
  });
  it("still gives a useful evaluation from the numbers when the AI is unavailable", async () => {
    ai.mockRejectedValue(new Error("busy"));
    const j = await (await post()).json();
    expect(j.data.evaluation.headline).toContain("Ohm's law");
    expect(j.data.evaluation.plan.length).toBeGreaterThan(0);
    expect(store.get("evaluations/u1")).toMatchObject({ usedAi: false });
  });
  it("won't show another account's saved evaluation", async () => {
    store.set("evaluations/someone-else", { evaluation: goodAi, signature: "x" });
    const j = await (await GET(new NextRequest("http://x/api/study/evaluation"))).json();
    expect(j.data.evaluation).toBeNull();
  });
});
