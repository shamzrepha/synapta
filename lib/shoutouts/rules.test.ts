import { describe, it, expect } from "vitest";
import { canSendShoutout, validateMessage, badgeCounts, badgeInfo } from "./rules";

const NOW = Date.UTC(2026, 5, 10, 15, 0, 0);
const rec = (toUid: string, offsetMs = 0) => ({ toUid, createdAtMs: NOW - offsetMs });

describe("shoutout rules", () => {
  it("blocks self and enforces the daily cap of 5", () => {
    expect(canSendShoutout("a", "a", [], NOW).ok).toBe(false);
    const five = ["b", "c", "d", "e", "f"].map((u) => rec(u, 1000));
    const r = canSendShoutout("a", "g", five, NOW);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("DAILY_LIMIT");
  });
  it("ignores yesterday's shout-outs and limits repeats to one person", () => {
    const yesterday = Array.from({ length: 5 }, (_, i) => rec("x" + i, 24 * 3600_000 + 1000));
    expect(canSendShoutout("a", "g", yesterday, NOW).ok).toBe(true);
    const r = canSendShoutout("a", "b", [rec("b", 1000)], NOW);
    expect(!r.ok && r.code).toBe("ALREADY_TODAY");
  });
  it("validates messages", () => {
    expect(validateMessage(" ").ok).toBe(false);
    expect(validateMessage("thanks for the help http://spam.com").ok).toBe(false);
    expect(validateMessage("Thanks for explaining moles!").ok).toBe(true);
    expect(validateMessage("a".repeat(300)).ok).toBe(false);
  });
  it("counts badges and falls back to a default", () => {
    expect(badgeCounts([{ badge: "thanks" }, { badge: "thanks" }, { badge: "patient" }])).toEqual({ thanks: 2, patient: 1 });
    expect(badgeInfo("nope").id).toBe("thanks");
  });
});
