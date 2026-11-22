import { describe, it, expect } from "vitest";
import { scoreAnswer, eventStatus, rankEntries } from "./scoring";

describe("quiz sprint scoring", () => {
  it("rewards speed: instant = 1000, at the limit = 500", () => {
    expect(scoreAnswer({ correct: true, elapsedMs: 0, limitMs: 20000, streakBefore: 0 }).points).toBe(1000);
    expect(scoreAnswer({ correct: true, elapsedMs: 20000, limitMs: 20000, streakBefore: 0 }).points).toBe(500);
    expect(scoreAnswer({ correct: true, elapsedMs: 10000, limitMs: 20000, streakBefore: 0 }).points).toBe(750);
  });

  it("adds a capped streak bonus and resets on a miss", () => {
    expect(scoreAnswer({ correct: true, elapsedMs: 0, limitMs: 20000, streakBefore: 1 })).toEqual({ points: 1100, streak: 2, late: false });
    expect(scoreAnswer({ correct: true, elapsedMs: 0, limitMs: 20000, streakBefore: 9 }).points).toBe(1500);
    expect(scoreAnswer({ correct: false, elapsedMs: 0, limitMs: 20000, streakBefore: 5 })).toEqual({ points: 0, streak: 0, late: false });
  });

  it("gives late answers nothing, with a small grace period", () => {
    expect(scoreAnswer({ correct: true, elapsedMs: 21000, limitMs: 20000, streakBefore: 0 }).points).toBe(500);
    expect(scoreAnswer({ correct: true, elapsedMs: 23000, limitMs: 20000, streakBefore: 0 })).toEqual({ points: 0, streak: 0, late: true });
  });
});

describe("event status", () => {
  const ev = { kind: "hackathon", startAt: new Date("2026-01-01T10:00Z"), endAt: new Date("2026-01-01T12:00Z"), votingEndsAt: new Date("2026-01-02T12:00Z") };
  it("moves through upcoming → live → voting → ended", () => {
    expect(eventStatus(ev, new Date("2026-01-01T09:00Z"))).toBe("upcoming");
    expect(eventStatus(ev, new Date("2026-01-01T11:00Z"))).toBe("live");
    expect(eventStatus(ev, new Date("2026-01-01T13:00Z"))).toBe("voting");
    expect(eventStatus(ev, new Date("2026-01-03T00:00Z"))).toBe("ended");
    expect(eventStatus({ ...ev, kind: "quiz_sprint" }, new Date("2026-01-01T13:00Z"))).toBe("ended");
  });
});

describe("ranking", () => {
  it("breaks ties by who finished first", () => {
    const r = rankEntries([
      { uid: "a", score: 100, tiebreak: 5 },
      { uid: "b", score: 300, tiebreak: 9 },
      { uid: "c", score: 100, tiebreak: 2 },
    ]);
    expect(r.map((x) => x.uid)).toEqual(["b", "c", "a"]);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3]);
  });
});

import { effectiveElapsedMs } from "./scoring";
describe("effectiveElapsedMs", () => {
  it("trusts the phone's stopwatch when it is close to the server's", () => {
    expect(effectiveElapsedMs(6000, 4500)).toBe(4500);
  });
  it("never trusts a time more than the grace below the server's", () => {
    expect(effectiveElapsedMs(10000, 100)).toBe(8000);
  });
  it("never reports more than the server saw, or accepts junk", () => {
    expect(effectiveElapsedMs(5000, 9000)).toBe(5000);
    expect(effectiveElapsedMs(5000, undefined)).toBe(5000);
    expect(effectiveElapsedMs(5000, -3)).toBe(5000);
    expect(effectiveElapsedMs(5000, NaN)).toBe(5000);
  });
});
