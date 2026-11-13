import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Firebase Admin
const mockUserDoc: Record<string, unknown> = {};
const mockDeviceDoc: Record<string, unknown> = {};
const mockActivityDays: Record<string, unknown> = {};

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => ({
    collection: (col: string) => ({
      doc: (id: string) => {
        if (col === "users") {
          return {
            get: vi.fn(async () => ({
              exists: Boolean(mockUserDoc[id]),
              data: () => mockUserDoc[id],
            })),
            update: vi.fn(async (up: Record<string, unknown>) => {
              Object.assign(mockUserDoc[id] as Record<string, unknown>, up);
            }),
          };
        }
        if (col === "deviceStats") {
          return {
            get: vi.fn(async () => ({
              exists: Boolean(mockDeviceDoc[id]),
              data: () => mockDeviceDoc[id],
            })),
          };
        }
        if (col === "userSignals") {
          return {
            set: vi.fn(async () => {}),
          };
        }
        return {
          get: vi.fn(async () => ({ exists: false, data: () => ({}) })),
          set: vi.fn(async () => {}),
        };
      },
    }),
  }),
  Timestamp: {
    now: () => "mock-timestamp",
  },
  FieldValue: {
    increment: (n: number) => n,
  },
}));

vi.mock("@/lib/activity/server", () => ({
  recordActivityDay: vi.fn(async () => {}),
  readActivityDays: vi.fn(async (uid: string) => {
    return (mockActivityDays[uid] as { counts: Record<string, number>; xp: Record<string, number> }) || { counts: {}, xp: {} };
  }),
}));

vi.mock("@/lib/live/server", () => ({
  bumpUserSignal: vi.fn(async () => {}),
}));

import { touchUserStreak } from "./server";

describe("touchUserStreak", () => {
  beforeEach(() => {
    for (const k of Object.keys(mockUserDoc)) delete mockUserDoc[k];
    for (const k of Object.keys(mockDeviceDoc)) delete mockDeviceDoc[k];
    for (const k of Object.keys(mockActivityDays)) delete mockActivityDays[k];
  });

  it("initializes a brand new active day with streak 1", async () => {
    mockUserDoc["user-1"] = {
      streakDays: 0,
      lastActiveDate: null,
      streakFreezes: 0,
    };

    const res = await touchUserStreak("user-1");
    expect(res.streakDays).toBe(1);
    expect(res.isNewDay).toBe(true);
    expect((mockUserDoc["user-1"] as Record<string, unknown>).streakDays).toBe(1);
  });

  it("advances consecutive days correctly (Day 1 -> Day 2 -> Day 3)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

    mockUserDoc["user-1"] = {
      streakDays: 2,
      lastActiveDate: yesterday,
      streakFreezes: 0,
    };

    const res = await touchUserStreak("user-1");
    expect(res.streakDays).toBe(3);
    expect(res.isNewDay).toBe(true);
    expect((mockUserDoc["user-1"] as Record<string, unknown>).streakDays).toBe(3);
    expect((mockUserDoc["user-1"] as Record<string, unknown>).lastActiveDate).toBe(today);
  });

  it("is idempotent on the same day and preserves streak", async () => {
    const today = new Date().toISOString().slice(0, 10);

    mockUserDoc["user-1"] = {
      streakDays: 3,
      lastActiveDate: today,
      streakFreezes: 0,
    };

    const res = await touchUserStreak("user-1");
    expect(res.streakDays).toBe(3);
    expect(res.isNewDay).toBe(false);
  });

  it("heals a user whose streak dropped to 0 but who has been active 3 days in a row", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    const twoDaysAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 2 * 86400000).toISOString().slice(0, 10);

    // User doc was erroneously set to 0
    mockUserDoc["user-1"] = {
      streakDays: 0,
      lastActiveDate: yesterday,
      streakFreezes: 0,
    };

    // Activity days show active for 3 days
    mockActivityDays["user-1"] = {
      counts: {
        [twoDaysAgo]: 1,
        [yesterday]: 1,
        [today]: 1,
      },
      xp: {},
    };

    const res = await touchUserStreak("user-1");
    expect(res.streakDays).toBe(3);
    expect((mockUserDoc["user-1"] as Record<string, unknown>).streakDays).toBe(3);
  });
});
