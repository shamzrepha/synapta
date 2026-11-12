import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const accessMock = vi.fn();
const trackProgressMock = vi.fn();
const txGetMock = vi.fn();
const txSetMock = vi.fn();
const txUpdateMock = vi.fn();

vi.mock("@/lib/auth/requireUser", () => ({
  requireUser: vi.fn().mockResolvedValue({ uid: "student-1", email: "s@sunroot.test", role: "student" }),
  handleAuthError: vi.fn((err: unknown) => {
    const msg = err instanceof Error ? err.message : "Error";
    return new Response(JSON.stringify({ ok: false, error: { code: "ERR", message: msg } }), { status: 500 });
  }),
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/auth/classAccess", () => ({
  assertClassAccess: (...args: unknown[]) => accessMock(...args),
}));

vi.mock("@/lib/game/progress", () => ({
  trackProgress: (...args: unknown[]) => trackProgressMock(...args),
}));

vi.mock("@/lib/firebase/admin", () => {
  const docStub = (path: string) => ({ path });
  const collStub = (name: string) => ({
    doc: (id: string) => ({
      path: `${name}/${id}`,
      collection: (sub: string) => ({
        doc: (subId: string) => docStub(`${name}/${id}/${sub}/${subId}`),
      }),
    }),
  });
  return {
    Timestamp: { now: () => ({ toMillis: () => 1_700_000_000_000 }) },
    adminDb: () => ({
      collection: collStub,
      runTransaction: async (fn: (t: { get: typeof txGetMock; set: typeof txSetMock; update: typeof txUpdateMock }) => Promise<unknown>) =>
        fn({ get: txGetMock, set: txSetMock, update: txUpdateMock }),
    }),
  };
});

import { POST } from "./route";

describe("POST /api/classes/[id]/read/signal", () => {
  beforeEach(() => {
    accessMock.mockReset();
    trackProgressMock.mockReset();
    txGetMock.mockReset();
    txSetMock.mockReset();
    txUpdateMock.mockReset();
  });

  it("returns safe non-enrolled response for teachers/previewers", async () => {
    accessMock.mockResolvedValue({ isEnrolled: false, isTeacher: true });
    const req = new NextRequest("http://localhost/api/classes/c1/read/signal", {
      method: "POST",
      body: JSON.stringify({ kcId: "kc1", event: "check_pass" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "c1" }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({
      ok: true,
      data: { enrolled: false, xpGained: 0, pL: null, exploredCount: 0, bonusLabel: null },
    });
    expect(trackProgressMock).not.toHaveBeenCalled();
  });

  it("nudges mental map softly and awards +10 XP once per day for check_pass", async () => {
    accessMock.mockResolvedValue({ isEnrolled: true, isTeacher: false });
    const todayStr = new Date().toISOString().split("T")[0];

    txGetMock.mockImplementation(async (ref: { path: string }) => {
      if (ref.path.includes("/kcs/")) {
        return { exists: true, data: () => ({ title: "Fractions" }) };
      }
      if (ref.path.startsWith("mastery/")) {
        return { exists: true, data: () => ({ pL: 0.25, exploredTerms: [], readRewardDate: todayStr, readCheckToday: false }) };
      }
      if (ref.path.startsWith("users/")) {
        return { exists: true, data: () => ({ xp: 50, streakDays: 2, lastActiveDate: todayStr }) };
      }
      return { exists: false, data: () => undefined };
    });

    const req = new NextRequest("http://localhost/api/classes/c1/read/signal", {
      method: "POST",
      body: JSON.stringify({ kcId: "kc1", event: "check_pass", concept: "Equivalent fractions" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "c1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.xpGained).toBe(10);
    expect(json.data.totalXp).toBe(60);
    expect(json.data.pL).toBe(0.31);
    expect(json.data.exploredCount).toBe(1);
    expect(trackProgressMock).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "student-1", xpAlreadyApplied: 10, reason: "reading:check_pass" })
    );

    // Repeat check_pass same day awards 0 XP
    txGetMock.mockImplementation(async (ref: { path: string }) => {
      if (ref.path.includes("/kcs/")) return { exists: true, data: () => ({ title: "Fractions" }) };
      if (ref.path.startsWith("mastery/")) {
        return { exists: true, data: () => ({ pL: 0.31, exploredTerms: ["Equivalent fractions"], readRewardDate: todayStr, readCheckToday: true }) };
      }
      if (ref.path.startsWith("users/")) return { exists: true, data: () => ({ xp: 60, streakDays: 2, lastActiveDate: todayStr }) };
      return { exists: false, data: () => undefined };
    });
    const req2 = new NextRequest("http://localhost/api/classes/c1/read/signal", {
      method: "POST",
      body: JSON.stringify({ kcId: "kc1", event: "check_pass" }),
    });
    const res2 = await POST(req2, { params: Promise.resolve({ id: "c1" }) });
    const json2 = await res2.json();
    expect(json2.data.xpGained).toBe(0);
  });
});
