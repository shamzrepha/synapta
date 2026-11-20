import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeDb, fakeTimestamp, fakeFieldValue, type Store } from "@/lib/testing/fake-firestore";

// Only the provider call is mocked: the real router, its JSON recovery and the route's schema all run.
const store: Store = new Map();
vi.mock("@/lib/firebase/admin", () => ({ Timestamp: fakeTimestamp, FieldValue: fakeFieldValue, adminDb: () => makeFakeDb(store) }));
vi.mock("@/lib/auth/requireUser", async (importOriginal) => {
  const errors = await import("@/lib/api/errors");
  const actual = await importOriginal<object>();
  return { ...actual, requireUser: async () => ({ uid: "t1", role: "teacher", email: "t@x.y" }), handleAuthError: errors.toErrorResponse };
});
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: async () => null }));
const provider = vi.fn();
vi.mock("@/lib/gemini/client", () => ({ getGeminiClient: () => ({ models: { generateContent: (...a: unknown[]) => provider(...a) } }) }));

import { NextRequest } from "next/server";
import { POST } from "./route";
import { pastQuestionSolutionSchema } from "@/lib/exam/solution";

const ctx = { params: Promise.resolve({ id: "c1" }) };
const solve = () =>
  POST(
    new NextRequest("http://x/api/classes/c1/past-questions", {
      method: "POST",
      body: JSON.stringify({ action: "solve", questionId: "q1", questionText: "Find the work done in an isothermal expansion" }),
      headers: { "content-type": "application/json" },
    }),
    ctx
  );

const realistic = {
  cohortStyle: "step_by_step_procedural",
  keyPrinciple: "First law of thermodynamics.",
  formulas: ["W = nRT ln(V2/V1)"],
  hints: ["Which variable stays constant?"],
  steps: [{ stepNumber: 1, title: "Set up", detail: "T is constant so dU = 0." }],
  finalAnswer: "W = 1.7 kJ",
  examinerTraps: ["Forgetting the sign convention"],
  twinQuestion: { question: "Repeat with 2 mol", solution: "W = 3.4 kJ" },
  cbtBlock: { stem: "Which is constant?", options: ["T", "P", "V", "S"], correctIndex: 0, explanation: "Isothermal." },
};

beforeEach(() => {
  store.clear();
  provider.mockReset();
  store.set("users/t1", { role: "teacher", monthlyTokenLimit: 1_000_000 });
  store.set("classes/c1", { title: "Thermo", teacherId: "t1" });
  store.set("classes/c1/pastQuestions/q1", { questionId: "q1", questionText: "Find the work done", topic: "Heat" });
});

describe("past-question solver: schema contract with the real router", () => {
  it("accepts the JSON the prompt asks for (also when wrapped in a code fence) and caches it", async () => {
    provider.mockResolvedValue({ text: "```json\n" + JSON.stringify(realistic) + "\n```", usageMetadata: {} });
    const res = await solve();
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.data.solution.finalAnswer).toBe("W = 1.7 kJ");
    expect(j.data.solution.steps).toHaveLength(1);
    expect(j.data.cached).toBe(false);
    expect((store.get("classes/c1/pastQuestions/q1") as { cohortSolutions: Record<string, unknown> }).cohortSolutions.step_by_step_procedural).toBeDefined();
  });

  it("tolerates missing optional parts and string-for-list drift", async () => {
    provider.mockResolvedValue({ text: JSON.stringify({ keyPrinciple: "p", formulas: "F = ma", steps: [{ title: "a", detail: "b" }], finalAnswer: 42 }), usageMetadata: {} });
    const res = await solve();
    expect(res.status).toBe(200);
    const sol = (await res.json()).data.solution;
    expect(sol.formulas).toEqual(["F = ma"]);
    expect(sol.finalAnswer).toBe("42");
    expect(sol.hints).toEqual([]);
    expect(sol.cbtBlock.options).toEqual([]);
  });

  it("returns a clean error, not a crash, for malformed JSON or an empty solution", async () => {
    provider.mockResolvedValue({ text: "Sure! Here is the solution: {not json", usageMetadata: {} });
    expect((await solve()).status).toBeGreaterThanOrEqual(400);
    provider.mockResolvedValue({ text: "{}", usageMetadata: {} });
    expect((await solve()).status).toBeGreaterThanOrEqual(400);
    expect((store.get("classes/c1/pastQuestions/q1") as { cohortSolutions?: unknown }).cohortSolutions).toBeUndefined();
  });

  it("schema itself rejects a reply with neither steps nor a final answer", () => {
    expect(pastQuestionSolutionSchema.safeParse({ keyPrinciple: "x" }).success).toBe(false);
    expect(pastQuestionSolutionSchema.safeParse(realistic).success).toBe(true);
  });
});
