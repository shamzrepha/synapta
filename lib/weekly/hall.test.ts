import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, Record<string, unknown>>();
const notify = vi.fn(async () => {});

vi.mock("@/lib/notifications/server", () => ({ notify: (...a: unknown[]) => (notify as (...x: unknown[]) => Promise<void>)(...a) }));
vi.mock("@/lib/social/profile", () => ({
  getPublicProfiles: async (uids: string[]) =>
    new Map(
      uids.map((u) => [
        u,
        { displayName: `Name ${u}`, username: `user_${u}`, photoURL: null, level: 1, showOnLeaderboard: !u.startsWith("hidden") },
      ])
    ),
}));
vi.mock("@/lib/firebase/admin", () => {
  const snap = (path: string) => ({ exists: store.has(path), data: () => store.get(path), id: path.split("/").pop() });
  const doc = (path: string) => ({
    get: async () => snap(path),
    set: async (v: Record<string, unknown>) => void store.set(path, { ...(store.get(path) || {}), ...v }),
    create: async (v: Record<string, unknown>) => {
      if (store.has(path)) throw new Error("ALREADY_EXISTS");
      store.set(path, v);
    },
    collection: (name: string) => collection(`${path}/${name}`),
  });
  const collection = (path: string): Record<string, unknown> => ({
    doc: (id: string) => doc(`${path}/${id}`),
    orderBy: (field: string, dir: string) => ({
      limit: (n: number) => ({
        get: async () => {
          const prefix = `${path}/`;
          const docs = [...store.entries()]
            .filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/"))
            .map(([k, v]) => ({ id: k.slice(prefix.length), data: () => v }))
            .sort((a, b) => (dir === "desc" ? -1 : 1) * (Number((a.data() as Record<string, number>)[field]) - Number((b.data() as Record<string, number>)[field])))
            .slice(0, n);
          return { docs };
        },
      }),
    }),
  });
  return {
    adminDb: () => ({ collection }),
    Timestamp: { now: () => ({ toMillis: () => Date.now() }), fromMillis: (n: number) => n },
    FieldValue: { increment: (n: number) => n },
  };
});

import { buildHallOfFame, type WinnerProfile } from "./hall";
import { finalizeWeek, finalizeRecentWeeks } from "./server";

const prof = (hidden = false): WinnerProfile => ({ displayName: "N", username: "u", photoURL: null, showOnLeaderboard: !hidden });

describe("hall of fame ordering", () => {
  it("ranks by XP gained, breaks ties by earlier finish, skips opted-out learners and caps at 10", () => {
    const entries = [
      { uid: "late", xp: 90, reachedAt: 5000 },
      { uid: "early", xp: 90, reachedAt: 1000 },
      { uid: "top", xp: 300, reachedAt: 9000 },
      { uid: "hidden1", xp: 500, reachedAt: 1 },
      ...Array.from({ length: 12 }, (_, i) => ({ uid: `p${i}`, xp: 10 + i, reachedAt: i })),
    ];
    const profiles = new Map(entries.map((e) => [e.uid, prof(e.uid === "hidden1")]));
    const hall = buildHallOfFame(entries, profiles);
    expect(hall).toHaveLength(10);
    expect(hall.slice(0, 3).map((w) => w.uid)).toEqual(["top", "early", "late"]);
    expect(hall.map((w) => w.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(hall.find((w) => w.uid === "hidden1")).toBeUndefined();
  });
});

describe("finalizeWeek", () => {
  beforeEach(() => {
    store.clear();
    notify.mockClear();
    const entry = (uid: string, xp: number) => store.set(`weeklyBoards/2026-W47/entries/${uid}`, { uid, xp });
    entry("a", 200);
    entry("b", 1);
    entry("c", 55);
    entry("hidden9", 999);
  });
  const NOW = new Date("2026-11-25T12:00:00Z"); // 2026-W48; last week is 2026-W47

  it("writes the hall of fame once and is idempotent", async () => {
    const first = await finalizeWeek("2026-W47", NOW);
    expect(first.created).toBe(true);
    expect(first.winners.map((w) => w.uid)).toEqual(["a", "c", "b"]);
    expect(notify).toHaveBeenCalledTimes(3);

    store.set("weeklyBoards/2026-W47/entries/late", { uid: "late", xp: 5000 }); // arrives after finalising: must not change history
    const second = await finalizeWeek("2026-W47", NOW);
    expect(second.created).toBe(false);
    expect(second.winners.map((w) => w.uid)).toEqual(["a", "c", "b"]);
    expect(notify).toHaveBeenCalledTimes(3);
    expect((store.get("weeklyWinners/2026-W47") as { winners: unknown[] }).winners).toHaveLength(3);
  });

  it("refuses a week that is not over", async () => {
    await expect(finalizeWeek("2026-W48", NOW)).rejects.toThrow(/not finished/);
  });

  it("finalizeRecentWeeks handles repeats and missed weeks", async () => {
    const r1 = await finalizeRecentWeeks(NOW, 1);
    expect(r1.map((r) => r.weekId)).toEqual(["2026-W47", "2026-W46"]);
    expect(r1.map((r) => r.created)).toEqual([true, true]);
    const r2 = await finalizeRecentWeeks(NOW, 1);
    expect(r2.map((r) => r.created)).toEqual([false, false]);
  });
});
