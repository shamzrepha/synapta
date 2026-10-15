import { describe, it, expect } from "vitest";
import { scoreMatch, findMatches, levelOk, canAct, type MentorProfile } from "./matching";

const mentee: MentorProfile = { uid: "me", role: "mentee", subjects: ["physics", "maths"], level: 9, availability: ["weekend", "weekday_evening"] };
const mk = (uid: string, over: Partial<MentorProfile> = {}): MentorProfile => ({ uid, role: "mentor", subjects: ["physics"], level: 11, availability: ["weekend"], ...over });

describe("mentor matching", () => {
  it("needs a level gap of at least one", () => {
    expect(levelOk(10, 9)).toBe(true);
    expect(levelOk(9, 9)).toBe(false);
    expect(scoreMatch(mentee, mk("a", { level: 9 }))).toBeNull();
    expect(scoreMatch(mentee, mk("a", { level: 8 }))).toBeNull();
  });
  it("needs opposite roles and a shared subject", () => {
    expect(scoreMatch(mentee, { ...mk("a"), role: "mentee" })).toBeNull();
    expect(scoreMatch(mentee, mk("a", { subjects: ["art"] }))).toBeNull();
    expect(scoreMatch(mentee, mentee)).toBeNull();
  });
  it("works from the mentor's side too", () => {
    const m = scoreMatch(mk("mentor1", { level: 12 }), { ...mentee, level: 10 });
    expect(m?.levelGap).toBe(2);
    expect(m?.reasons[1]).toContain("below you");
  });
  it("ranks subject overlap and availability higher, with reasons", () => {
    const best = mk("best", { subjects: ["physics", "maths"], availability: ["weekend", "weekday_evening"] });
    const ok = mk("ok");
    const none = mk("none", { availability: ["weekday_morning"] });
    const ranked = findMatches(mentee, [none, ok, best]);
    expect(ranked.map((r) => r.uid)).toEqual(["best", "ok", "none"]);
    expect(ranked[0].sharedSubjects).toEqual(["physics", "maths"]);
    expect(ranked[2].reasons.join(" ")).toContain("No shared free time");
  });
  it("excludes people already in a request", () => {
    expect(findMatches(mentee, [mk("a"), mk("b")], 10, new Set(["a"])).map((m) => m.uid)).toEqual(["b"]);
  });
  it("only the right person can act on a pending request", () => {
    const r = { fromUid: "x", toUid: "y" };
    expect(canAct("accept", "pending", "y", r)).toBe(true);
    expect(canAct("accept", "pending", "x", r)).toBe(false);
    expect(canAct("cancel", "pending", "x", r)).toBe(true);
    expect(canAct("decline", "accepted", "y", r)).toBe(false);
  });
});
