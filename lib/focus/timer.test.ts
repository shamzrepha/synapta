import { describe, it, expect } from "vitest";
import { timerAt, canClaimBlock, clampConfig, formatClock, normalizeCode, makeCode, blockEndMs } from "./timer";

const cfg = { focusMin: 25, breakMin: 5 };
const M = 60_000;

describe("timerAt", () => {
  it("starts in focus", () => {
    expect(timerAt(0, cfg, 0)).toMatchObject({ phase: "focus", block: 0, remainingMs: 25 * M });
  });
  it("switches to break then next block", () => {
    expect(timerAt(0, cfg, 26 * M)).toMatchObject({ phase: "break", block: 0, remainingMs: 4 * M });
    expect(timerAt(0, cfg, 31 * M)).toMatchObject({ phase: "focus", block: 1, remainingMs: 24 * M });
  });
  it("treats clock skew before anchor as the start", () => {
    expect(timerAt(1000, cfg, 0).remainingMs).toBe(25 * M);
  });
});

describe("canClaimBlock", () => {
  const base = { anchorMs: 0, cfg, block: 0, joinedAtMs: 0, nowMs: 25 * M + 1000 };
  it("accepts a finished block", () => expect(canClaimBlock(base).ok).toBe(true));
  it("rejects early claims", () => expect(canClaimBlock({ ...base, nowMs: 10 * M }).ok).toBe(false));
  it("rejects late joiners", () => expect(canClaimBlock({ ...base, joinedAtMs: 5 * M }).ok).toBe(false));
  it("rejects stale blocks", () => expect(canClaimBlock({ ...base, nowMs: blockEndMs(0, cfg, 0) + 7 * 3600_000 }).ok).toBe(false));
  it("rejects bad indices", () => expect(canClaimBlock({ ...base, block: -1 }).ok).toBe(false));
});

describe("helpers", () => {
  it("clamps config", () => {
    expect(clampConfig({ focusMin: 1000, breakMin: 0 })).toEqual({ focusMin: 90, breakMin: 1 });
    expect(clampConfig({})).toEqual(cfg);
  });
  it("formats clock", () => expect(formatClock(61_000)).toBe("01:01"));
  it("codes", () => {
    expect(normalizeCode(" ab-c234 ")).toBe("ABC234");
    expect(normalizeCode("abc")).toBeNull();
    expect(makeCode()).toMatch(/^[A-Z2-9]{6}$/);
  });
});
