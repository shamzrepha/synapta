import { describe, it, expect } from "vitest";
import { matchesFilter, sortPeople, parseFilters, type BrowsePerson } from "./people-browse";

const NOW = Date.parse("2026-11-05T12:00:00Z");
const day = (n: number) => new Date(NOW + n * 86_400_000).toISOString();
const p = (o: Partial<BrowsePerson>): BrowsePerson => ({ name: "A", email: "a@x.com", role: "student", paid: false, planExpiresAt: null, grantKind: null, isTester: false, createdAt: 0, xp: 0, lastActive: 0, ...o });

describe("people filters", () => {
  const people = [
    p({ name: "Free Fred" }),
    p({ name: "Paying Pat", paid: true, planExpiresAt: day(20) }),
    p({ name: "Gifted Gail", paid: true, grantKind: "gift", planExpiresAt: day(30) }),
    p({ name: "Trial Tom", paid: true, grantKind: "trial", planExpiresAt: day(3) }),
    p({ name: "Tester Tess", isTester: true }),
    p({ name: "Teacher Tia", role: "teacher" }),
  ];
  const names = (role: Parameters<typeof matchesFilter>[1], plan: Parameters<typeof matchesFilter>[2]) => people.filter((x) => matchesFilter(x, role, plan, NOW)).map((x) => x.name);

  it("filters by plan type", () => {
    expect(names("all", "paid")).toEqual(["Paying Pat"]);
    expect(names("all", "gifted")).toEqual(["Gifted Gail"]);
    expect(names("all", "trial")).toEqual(["Trial Tom"]);
    expect(names("all", "tester")).toEqual(["Tester Tess"]);
    expect(names("all", "free")).toEqual(["Free Fred", "Tester Tess", "Teacher Tia"]);
  });
  it("finds plans ending within a week", () => {
    expect(names("all", "ending")).toEqual(["Trial Tom"]);
  });
  it("filters by account type and combines with plan", () => {
    expect(names("teacher", "all")).toEqual(["Teacher Tia"]);
    expect(names("teacher", "paid")).toEqual([]);
  });
});

describe("people sorting", () => {
  it("newest first, by name, by plan ending soonest, by xp, by last active", () => {
    const list = [p({ name: "B", createdAt: 1, xp: 5, lastActive: 3, planExpiresAt: day(9) }), p({ name: "A", createdAt: 2, xp: 9, lastActive: 1, planExpiresAt: day(2) }), p({ name: "C", createdAt: 3, xp: 1, lastActive: 2 })];
    const n = (s: Parameters<typeof sortPeople>[1]) => sortPeople(list, s).map((x) => x.name).join("");
    expect(n("newest")).toBe("CAB");
    expect(n("name")).toBe("ABC");
    expect(n("ending")).toBe("ABC");
    expect(n("xp")).toBe("ABC");
    expect(n("active")).toBe("BCA");
  });
  it("does not change the list it is given", () => {
    const list = [p({ name: "B" }), p({ name: "A" })];
    sortPeople(list, "name");
    expect(list[0].name).toBe("B");
  });
});

describe("filter parsing", () => {
  it("accepts known values and falls back for anything else", () => {
    expect(parseFilters(new URLSearchParams("role=teacher&plan=trial&sort=xp"))).toEqual({ role: "teacher", plan: "trial", sort: "xp" });
    expect(parseFilters(new URLSearchParams("role=hacker&plan=x&sort=drop"))).toEqual({ role: "all", plan: "all", sort: "newest" });
  });
});
