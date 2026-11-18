import { describe, it, expect, vi, beforeEach } from "vitest";

let reads = 0;
let users: Array<[string, Record<string, unknown>]> = [];
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => ({
    collection: () => ({
      orderBy: () => ({
        limit: (n: number) => ({
          get: async () => {
            reads += 1;
            return { docs: users.slice(0, n).map(([id, d]) => ({ id, data: () => d })) };
          },
        }),
      }),
    }),
  }),
}));

import { loadCampuses, resetCampusCache } from "./standings";

describe("inter-school standings", () => {
  beforeEach(() => {
    reads = 0;
    resetCampusCache();
    users = [
      ["a", { institution: "Alpha High", xp: 900, displayName: "Hidden Hero", settings: { showOnLeaderboard: false } }],
      ["b", { institution: "alpha high ", xp: 100, displayName: "Visible Vic", photoURL: "p.jpg" }],
      ["c", { institution: "Beta College", xp: 500, displayName: "Bea" }],
      ["d", { xp: 5000, displayName: "No School" }],
    ];
  });

  it("groups by school, ignores people with no school, and never names someone who opted out of leaderboards", async () => {
    const c = await loadCampuses();
    expect(c.map((x) => [x.institution, x.studentCount, x.totalXp])).toEqual([
      ["Alpha High", 2, 1000],
      ["Beta College", 1, 500],
    ]);
    expect(c[0].topScholarName).toBe("Visible Vic");
    expect(c[0].topScholarUid).toBe("b");
  });

  it("reads the users once per two minutes however many pages ask", async () => {
    await loadCampuses(1_000);
    await loadCampuses(60_000);
    expect(reads).toBe(1);
    await loadCampuses(1_000 + 130_000);
    expect(reads).toBe(2);
  });
});
