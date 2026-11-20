import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeDb, fakeTimestamp, fakeFieldValue, type Store } from "@/lib/testing/fake-firestore";

const store: Store = new Map();
vi.mock("@/lib/firebase/admin", () => ({ Timestamp: fakeTimestamp, FieldValue: fakeFieldValue, adminDb: () => makeFakeDb(store) }));
let caller = { uid: "s1", role: "student", email: "s@x.y" };
vi.mock("@/lib/auth/requireUser", async () => {
  const errors = await import("@/lib/api/errors");
  return { requireUser: async () => caller, handleAuthError: errors.toErrorResponse };
});
const limiter: Array<{ keyPrefix: string; shared?: boolean }> = [];
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: async (_r: unknown, o: { keyPrefix: string; shared?: boolean }) => (limiter.push(o), null) }));
const ai = vi.fn();
vi.mock("@/lib/ai/router", () => ({ generateWithFallback: (o: unknown) => ai(o) }));
const evidence = vi.fn();
vi.mock("@/lib/evidence/apply", () => ({ applyEvidenceIfEnrolled: (a: unknown) => evidence(a) }));
const check = vi.fn();
const record = vi.fn();
vi.mock("@/lib/billing/usage", () => ({ checkFeature: (...a: unknown[]) => check(...a), recordFeature: (...a: unknown[]) => record(...a) }));

import { NextRequest } from "next/server";
import { POST as generate } from "./generate/route";
import { POST as mark } from "./mark/route";

const post = (fn: typeof generate, body: unknown) => fn(new NextRequest("http://x/api/practice/theory", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

const NOTES = "Osmosis is the movement of water across a semi-permeable membrane from a region of low solute concentration to high solute concentration. ".repeat(4);
const rawSet = {
  questions: [
    { command: "Define", question: "Define osmosis in one or two sentences.", marks: 2, keyPoints: [{ point: "Movement of water across a semi-permeable membrane", marks: 1.5, mustInclude: ["membrane"] }, { point: "Low to high solute concentration", marks: 0.5, mustInclude: [] }], modelAnswer: "Osmosis is the movement of water...", tip: "Name the membrane." },
    { command: "Explain", question: "Explain why a wilted plant recovers when watered.", marks: 5, keyPoints: [{ point: "Soil water has higher water potential", marks: 2, mustInclude: [] }, { point: "Water enters root hairs by osmosis", marks: 3, mustInclude: ["root"] }], modelAnswer: "Watering raises the soil...", tip: "" },
  ],
};
const markingFor = (awarded: number, quote: string) => ({ points: [{ index: 0, awarded, quote, note: "n" }, { index: 1, awarded: 0, quote: "", note: "" }], feedback: "Good start.", tip: "Write the term." });
const GOOD = "Osmosis is the movement of water across a semi-permeable membrane from low to high solute concentration in cells";

const getQuestions = async (body: Record<string, unknown> = { classId: "c1", kcId: "k1", difficulty: "medium" }) => (await (await post(generate, body)).json()).data.questions as Array<{ id: string; marks: number }>;

beforeEach(() => {
  store.clear();
  ai.mockReset();
  evidence.mockReset();
  check.mockReset();
  record.mockReset();
  limiter.length = 0;
  caller = { uid: "s1", role: "student", email: "s@x.y" };
  store.set("classes/c1", { title: "Biology", teacherId: "t1" });
  store.set("enrollments/c1_s1", { status: "active" });
  store.set("classes/c1/kcs/k1", { title: "Osmosis", lessonMarkdown: NOTES, contentPublished: { lesson: true } });
  ai.mockImplementation(async (o: { task: string }) => ({ data: o.task === "theory_set" ? rawSet : markingFor(1.5, "semi-permeable membrane"), modelUsed: "m" }));
});

describe("POST /api/practice/theory/generate", () => {
  it("returns questions without the marking guide, using a stable shared cache key and the setter task", async () => {
    const res = await post(generate, { classId: "c1", kcId: "k1", difficulty: "medium" });
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.data.questions).toHaveLength(2);
    expect(JSON.stringify(j)).not.toContain("modelAnswer");
    expect(JSON.stringify(j)).not.toContain("keyPoints");
    await post(generate, { classId: "c1", kcId: "k1", difficulty: "medium" });
    const [a, b] = ai.mock.calls.map((c) => c[0]);
    expect(a.task).toBe("theory_set");
    expect(a.cacheKey).toBe(b.cacheKey);
    expect(a.userPrompt).not.toContain("s1");
    expect(limiter[0]).toMatchObject({ keyPrefix: "theory_generate", shared: true });
    // class topic: shared work, not charged to the learner's plan
    expect(check).not.toHaveBeenCalled();
  });

  it("uses a different cache key per difficulty", async () => {
    await post(generate, { classId: "c1", kcId: "k1", difficulty: "easy" });
    await post(generate, { classId: "c1", kcId: "k1", difficulty: "hard" });
    expect(ai.mock.calls[0][0].cacheKey).not.toBe(ai.mock.calls[1][0].cacheKey);
  });

  it("refuses a non-member and an unpublished lesson for students, but lets the teacher in", async () => {
    caller = { uid: "outsider", role: "student", email: "o@x.y" };
    expect((await post(generate, { classId: "c1", kcId: "k1" })).status).toBe(403);
    caller = { uid: "s1", role: "student", email: "s@x.y" };
    store.set("classes/c1/kcs/k1", { title: "Osmosis", lessonMarkdown: NOTES, liveLessonMarkdown: "", contentPublished: { lesson: false } });
    expect((await post(generate, { classId: "c1", kcId: "k1" })).status).toBe(404);
    caller = { uid: "t1", role: "teacher", email: "t@x.y" };
    expect((await post(generate, { classId: "c1", kcId: "k1" })).status).toBe(200);
  });

  it("students of a snapshot topic get questions from the pushed copy, not the teacher's draft", async () => {
    store.set("classes/c1/kcs/k1", { title: "Osmosis", lessonMarkdown: "DRAFT ".repeat(60), liveLessonMarkdown: NOTES, contentPublished: { lesson: { at: 1 } } });
    await post(generate, { classId: "c1", kcId: "k1" });
    expect(ai.mock.calls[0][0].userPrompt).toContain("Osmosis is the movement");
    expect(ai.mock.calls[0][0].userPrompt).not.toContain("DRAFT");
  });

  it("charges a learner's own notes to their plan and validates the body", async () => {
    store.set("studyNotes/n1", { uid: "s1", title: "My bio", head: 1 });
    store.set("studyNotes/n1/versions/1", { n: 1, markdown: NOTES });
    const res = await post(generate, { noteId: "n1" });
    expect(res.status).toBe(200);
    expect(check).toHaveBeenCalledWith("s1", "practice");
    expect(record).toHaveBeenCalledWith("s1", "practice");
    caller = { uid: "other", role: "student", email: "o@x.y" };
    expect((await post(generate, { noteId: "n1" })).status).toBe(404);
    expect((await post(generate, { classId: "c1" })).status).toBe(400);
  });
});

describe("POST /api/practice/theory/mark", () => {
  it("marks against the guide, recomputes the score, stores the attempt and credits cautious evidence", async () => {
    evidence.mockResolvedValue({ pLAfter: 0.4 });
    const [q] = await getQuestions();
    const res = await post(mark, { classId: "c1", kcId: "k1", difficulty: "medium", strictness: "balanced", questionId: q.id, answer: GOOD });
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.data.result.score).toBe(1.5);
    expect(j.data.result.marks).toBe(2);
    expect(j.data.result.points[0].quote).toBe("semi-permeable membrane");
    expect(j.data.result.modelAnswer).toContain("Osmosis");
    expect(j.data.evidence.credited).toBe(true);
    expect(evidence).toHaveBeenCalledWith(expect.objectContaining({ uid: "s1", activity: "theory", correct: true }));
    const markCall = ai.mock.calls.map((c) => c[0]).find((c) => c.task === "theory_mark");
    expect(markCall.cacheKey).toBeUndefined();
    expect(markCall.userPrompt).toContain("<STUDENT_ANSWER>");
    expect(limiter.some((l) => l.keyPrefix === "theory_mark" && l.shared)).toBe(true);
    expect(check).toHaveBeenCalledWith("s1", "practice");
    expect(record).toHaveBeenCalledWith("s1", "practice");
    const attempts = [...store.entries()].filter(([k]) => k.startsWith("theoryAttempts/"));
    expect(attempts).toHaveLength(1);
    expect(attempts[0][1]).toMatchObject({ uid: "s1", score: 1.5, strictness: "balanced" });
  });

  it("ignores an inflated AI score: a point is capped at its marks", async () => {
    ai.mockImplementation(async (o: { task: string }) => ({ data: o.task === "theory_set" ? rawSet : { points: [{ index: 0, awarded: 15, quote: "semi-permeable membrane", note: "" }, { index: 1, awarded: 15, quote: "low to high solute concentration", note: "" }], feedback: "", tip: "" }, modelUsed: "m" }));
    const [q] = await getQuestions();
    const j = await (await post(mark, { classId: "c1", kcId: "k1", questionId: q.id, answer: GOOD, strictness: "lenient" })).json();
    expect(j.data.result.score).toBe(2);
  });

  it("scores a too-short answer 0 with no AI call, no plan charge and no evidence", async () => {
    const [q] = await getQuestions();
    ai.mockClear();
    const j = await (await post(mark, { classId: "c1", kcId: "k1", questionId: q.id, answer: "idk" })).json();
    expect(j.data.result.score).toBe(0);
    expect(ai.mock.calls.some((c) => c[0].task === "theory_mark")).toBe(false);
    expect(check).not.toHaveBeenCalled();
    expect(evidence).not.toHaveBeenCalled();
  });

  it("gives no evidence in lenient mode, for short answers, own notes, or a repeat of the same question today", async () => {
    evidence.mockResolvedValue({ pLAfter: 0.4 });
    const [q] = await getQuestions();
    const base = { classId: "c1", kcId: "k1", questionId: q.id };
    const lenient = await (await post(mark, { ...base, strictness: "lenient", answer: GOOD })).json();
    expect(lenient.data.evidence.credited).toBe(false);
    const short = await (await post(mark, { ...base, strictness: "balanced", answer: "Water moves across a semi-permeable membrane." })).json();
    expect(short.data.evidence.credited).toBe(false);
    expect(evidence).not.toHaveBeenCalled();
    const first = await (await post(mark, { ...base, strictness: "balanced", answer: GOOD })).json();
    expect(first.data.evidence.credited).toBe(true);
    const again = await (await post(mark, { ...base, strictness: "balanced", answer: GOOD })).json();
    expect(again.data.evidence.credited).toBe(false);
    expect(evidence).toHaveBeenCalledTimes(1);
  });

  it("does not fail the marking when the daily evidence cap is hit", async () => {
    const { ApiError } = await import("@/lib/api/errors");
    evidence.mockRejectedValue(new ApiError(429, "THEORY_RATE_LIMITED", "cap reached"));
    const [q] = await getQuestions();
    const res = await post(mark, { classId: "c1", kcId: "k1", questionId: q.id, strictness: "strict", answer: GOOD });
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.data.evidence).toMatchObject({ credited: false, reason: "cap reached" });
  });

  it("rejects non-members, unknown questions and oversize bodies", async () => {
    const [q] = await getQuestions();
    expect((await post(mark, { classId: "c1", kcId: "k1", questionId: "nope", answer: GOOD })).status).toBe(409);
    expect((await post(mark, { classId: "c1", kcId: "k1", questionId: q.id, answer: "x".repeat(9000) })).status).toBe(400);
    caller = { uid: "outsider", role: "student", email: "o@x.y" };
    expect((await post(mark, { classId: "c1", kcId: "k1", questionId: q.id, answer: GOOD })).status).toBe(403);
  });
});
