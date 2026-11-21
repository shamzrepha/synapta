import { describe, it, expect, vi, beforeEach } from "vitest";

const docs = new Map<string, Record<string, unknown>>();
const key = (col: string, id: string) => `${col}/${id}`;

vi.mock("@/lib/firebase/admin", () => {
  const ref = (col: string, id: string) => ({ col, id, get: async () => snap(col, id) });
  const snap = (col: string, id: string) => {
    const v = docs.get(key(col, id));
    return { exists: v !== undefined, data: () => v, id };
  };
  return {
    adminDb: () => ({
      collection: (col: string) => ({ doc: (id: string) => ref(col, id) }),
      getAll: async (...refs: Array<{ col: string; id: string }>) => refs.map((r) => snap(r.col, r.id)),
      runTransaction: async (fn: (t: unknown) => Promise<unknown>) =>
        fn({
          get: async (r: { col: string; id: string }) => snap(r.col, r.id),
          set: (r: { col: string; id: string }, v: Record<string, unknown>, o?: { merge?: boolean }) =>
            docs.set(key(r.col, r.id), o?.merge ? { ...(docs.get(key(r.col, r.id)) || {}), ...v } : v),
          update: (r: { col: string; id: string }, v: Record<string, unknown>) =>
            docs.set(key(r.col, r.id), { ...(docs.get(key(r.col, r.id)) || {}), ...v }),
        }),
    }),
    Timestamp: { now: () => "ts" },
    FieldValue: { increment: (n: number) => n },
  };
});
vi.mock("@/lib/live/server", () => ({ bumpUserSignal: vi.fn(async () => {}) }));
vi.mock("@/lib/notifications/server", () => ({ notify: vi.fn(async () => {}) }));

import { recordLearning, readStreakToday, viewStreak } from "./server";

const NOW = new Date("2026-11-25T10:00:00Z");
const TODAY = "2026-11-25";
const user = () => docs.get("users/u1") as Record<string, unknown>;

describe("recordLearning (streaks count learning, not logging in)", () => {
  beforeEach(() => {
    docs.clear();
  });

  it("ignores anything that is not a learning kind (login, presence, notification)", async () => {
    docs.set("users/u1", { streakDays: 5, lastQualifiedDate: "2026-11-24", streakFreezes: 0 });
    for (const k of ["login", "presence", "notification", "app_open"]) expect(await recordLearning("u1", k, { now: NOW })).toBeNull();
    expect(user()).toEqual({ streakDays: 5, lastQualifiedDate: "2026-11-24", streakFreezes: 0 });
    expect(docs.has(`streakDays/u1_${TODAY}`)).toBe(false);
  });

  it("does not extend the streak until the day reaches 30 points, then extends exactly once", async () => {
    docs.set("users/u1", { streakDays: 5, lastQualifiedDate: "2026-11-24", streakFreezes: 0 });
    for (let i = 0; i < 9; i++) {
      const r = await recordLearning("u1", "quiz", { now: NOW });
      expect(r?.qualified).toBe(false);
    }
    expect(user().streakDays).toBe(5);
    const tenth = await recordLearning("u1", "quiz", { now: NOW });
    expect(tenth).toMatchObject({ qualified: true, newlyQualified: true, streakDays: 6 });
    expect(user()).toMatchObject({ streakDays: 6, lastQualifiedDate: TODAY, lastActiveDate: TODAY });
    const eleventh = await recordLearning("u1", "quiz", { now: NOW });
    expect(eleventh).toMatchObject({ newlyQualified: false, streakDays: 6 });
    expect(user().streakDays).toBe(6);
  });

  it("one spammed action type cannot qualify the day", async () => {
    docs.set("users/u1", { streakDays: 3, lastQualifiedDate: "2026-11-24" });
    for (let i = 0; i < 200; i++) await recordLearning("u1", "flashcard", { now: NOW });
    expect(user().streakDays).toBe(3);
    expect((await readStreakToday("u1", NOW)).points).toBe(20);
  });

  it("throttles reader signals sent faster than the gap", async () => {
    docs.set("users/u1", { streakDays: 3, lastQualifiedDate: "2026-11-24" });
    for (let i = 0; i < 20; i++) await recordLearning("u1", "reader", { now: new Date(NOW.getTime() + i * 1000) });
    expect((await readStreakToday("u1", NOW)).counts.reader).toBe(2); // t=0 and t=15s
  });

  it("a legacy streak (only lastActiveDate) continues from that date", async () => {
    docs.set("users/u1", { streakDays: 9, lastActiveDate: "2026-11-24", streakFreezes: 0 });
    await recordLearning("u1", "lab", { now: NOW });
    const r = await recordLearning("u1", "lab", { now: NOW });
    expect(r?.streakDays).toBe(10);
  });

  it("a missed day resets to 1 without a freeze and uses a freeze when held", async () => {
    docs.set("users/u1", { streakDays: 9, lastQualifiedDate: "2026-11-22", streakFreezes: 0 });
    await recordLearning("u1", "quiz", { n: 10, now: NOW });
    expect(user().streakDays).toBe(1);
    docs.clear();
    docs.set("users/u1", { streakDays: 9, lastQualifiedDate: "2026-11-23", streakFreezes: 1 });
    await recordLearning("u1", "quiz", { n: 10, now: NOW });
    expect(user()).toMatchObject({ streakDays: 10, streakFreezes: 0 });
  });
});

describe("viewStreak is read-only", () => {
  it("login day without learning shows at risk, not extended", () => {
    const v = viewStreak({ streakDays: 4, lastQualifiedDate: "2026-11-24", lastActiveDate: "2026-11-24" }, TODAY);
    expect(v).toMatchObject({ streakDays: 4, qualifiedToday: false, atRisk: true });
  });
  it("a broken streak shows 0 and qualified days show safe", () => {
    expect(viewStreak({ streakDays: 4, lastQualifiedDate: "2026-11-20" }, TODAY).streakDays).toBe(0);
    expect(viewStreak({ streakDays: 4, lastQualifiedDate: TODAY }, TODAY)).toMatchObject({ qualifiedToday: true, atRisk: false });
  });
});
