import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeDb, fakeTimestamp, type Store } from "@/lib/testing/fake-firestore";

const store: Store = new Map();
vi.mock("@/lib/firebase/admin", () => ({ Timestamp: fakeTimestamp, adminDb: () => makeFakeDb(store) }));
let uid = "s1";
vi.mock("@/lib/auth/requireUser", async () => {
  const errors = await import("@/lib/api/errors");
  return { requireUser: async () => ({ uid, role: "student", email: "s@x.y" }), handleAuthError: errors.toErrorResponse };
});
const limited: string[] = [];
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: async (_r: unknown, o: { keyPrefix: string }) => {
    limited.push(o.keyPrefix);
    return null;
  },
}));

import { NextRequest } from "next/server";
import { POST } from "./route";

const post = (body: Record<string, unknown>) =>
  POST(new NextRequest("http://x/api/study/telemetry", { method: "POST", body: JSON.stringify({ questionId: "q1", classId: "c1", dwellMs: 60_000, ...body }), headers: { "content-type": "application/json" } }));

beforeEach(() => {
  store.clear();
  limited.length = 0;
  uid = "s1";
  store.set("classes/c1", { title: "Thermo", teacherId: "t1" });
  store.set("enrollments/c1_s1", { status: "active" });
  store.set("classes/c1/pastQuestions/q1", { questionText: "Q", peerMedianMs: 90_000, dwellSampleCount: 5 });
});

describe("study telemetry", () => {
  it("rate limits", async () => {
    await post({});
    expect(limited).toContain("telemetry");
  });
  it("lets a class member feed the question's peer median and clarity votes", async () => {
    await post({ correct: false, dwellMs: 200_000 });
    const q = store.get("classes/c1/pastQuestions/q1")!;
    expect(q.dwellSampleCount).toBe(6);
    expect((q.cohortFeedback as Record<string, { reExplain: number }>).step_by_step_procedural.reExplain).toBe(1);
  });
  it("ignores a class the caller is not in, so strangers cannot poison its shared numbers", async () => {
    uid = "stranger";
    const r = await post({ correct: false, dwellMs: 3_600_000 });
    expect(r.status).toBe(200);
    expect(store.get("classes/c1/pastQuestions/q1")).toEqual({ questionText: "Q", peerMedianMs: 90_000, dwellSampleCount: 5 });
  });
  it("counts one clarity vote per learner per question, so nobody can force the AI to regenerate an explanation", async () => {
    for (let i = 0; i < 6; i++) await post({ correct: false });
    const q = store.get("classes/c1/pastQuestions/q1")!;
    expect((q.cohortFeedback as Record<string, { reExplain: number }>).step_by_step_procedural.reExplain).toBe(1);
  });
});
