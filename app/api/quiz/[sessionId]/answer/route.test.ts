import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeDb, fakeTimestamp, type Store } from "@/lib/testing/fake-firestore";

const store: Store = new Map();
vi.mock("@/lib/firebase/admin", () => ({ Timestamp: fakeTimestamp, adminDb: () => makeFakeDb(store) }));
let uid = "s1";
vi.mock("@/lib/auth/requireUser", async () => {
  const errors = await import("@/lib/api/errors");
  return { requireUser: async () => ({ uid, role: "student", email: "s@x.y" }), handleAuthError: errors.toErrorResponse };
});
const evidence = vi.fn();
vi.mock("@/lib/evidence/apply", () => ({ applyEvidenceIfEnrolled: (a: unknown) => evidence(a) }));
const signal = vi.fn();
vi.mock("@/lib/adaptive/learner-dna", () => ({ recordAdaptiveSignal: (a: unknown) => signal(a) }));
vi.mock("@/lib/teacher/misconceptions", () => ({ trackMisconception: async () => {} }));
vi.mock("@/lib/mistakes/store", () => ({ recordMistake: async () => {} }));
vi.mock("@/lib/i18n/serve", () => ({ classSourceLanguage: async () => "en", localizeFor: async (_r: unknown, _c: unknown, _m: unknown, x: unknown) => x }));

import { NextRequest } from "next/server";
import { POST } from "./route";

const answer = (selectedOptionIndex: number, questionIndex = 0) =>
  POST(new NextRequest("http://x/api/quiz/qs1/answer", { method: "POST", body: JSON.stringify({ questionIndex, selectedOptionIndex }), headers: { "content-type": "application/json" } }), {
    params: Promise.resolve({ sessionId: "qs1" }),
  });

beforeEach(() => {
  store.clear();
  evidence.mockReset();
  signal.mockReset();
  uid = "s1";
  store.set("quizSessions/qs1", { uid: "s1", classId: "c1", kcId: "k1", answered: {}, questions: [{ question: "2+2?", options: ["3", "4"], correctIndex: 1, explanation: "four" }] });
  store.set("classes/c1", { title: "Maths" });
});

describe("quiz answers", () => {
  it("are marked on the server from the stored key, and only for the session's owner", async () => {
    evidence.mockResolvedValue({ pLAfter: 0.5 });
    uid = "someone-else";
    expect((await answer(1)).status).toBe(403);
    uid = "s1";
    const j = await (await answer(0)).json();
    expect(j.data.correct).toBe(false);
    expect(j.data.correctIndex).toBe(1);
  });
  it("records one learning signal per answer, not two", async () => {
    // applyEvidenceIfEnrolled already records the signal for a credited answer
    evidence.mockResolvedValue({ pLAfter: 0.5 });
    await answer(1);
    expect(signal).not.toHaveBeenCalled();
  });
  it("still records the signal when the learner is not enrolled (no evidence credited)", async () => {
    evidence.mockResolvedValue(null);
    await answer(1);
    expect(signal).toHaveBeenCalledTimes(1);
  });
});
