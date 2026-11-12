import { describe, expect, it } from "vitest";
import { breakMinutes, formatClock, IDLE, remainingMs, startFocus, tick } from "./focus";

const MIN = 60_000;

describe("focus sprint", () => {
  it("starts a sprint of the asked length, kept within 1 to 60 minutes", () => {
    const s = startFocus(1000, 10);
    expect(s.phase).toBe("focus");
    expect(s.endsAt - s.startedAt).toBe(10 * MIN);
    expect(startFocus(0, 0).endsAt).toBe(1 * MIN);
    expect(startFocus(0, 500).endsAt).toBe(60 * MIN);
  });

  it("cheers once at the halfway mark, not before and not twice", () => {
    let s = startFocus(0, 10);
    let r = tick(s, 4 * MIN);
    expect(r.event).toBe("none");
    r = tick(r.state, 5 * MIN);
    expect(r.event).toBe("halfway");
    expect(tick(r.state, 6 * MIN).event).toBe("none");
    s = r.state;
    expect(s.phase).toBe("focus");
  });

  it("finishes into a break, then back to idle", () => {
    let r = tick(startFocus(0, 10), 10 * MIN);
    expect(r.event).toBe("focus-done");
    expect(r.state.phase).toBe("break");
    expect(remainingMs(r.state, 10 * MIN)).toBe(breakMinutes(10) * MIN);
    expect(tick(r.state, 11 * MIN).event).toBe("none");
    r = tick(r.state, 12 * MIN);
    expect(r.event).toBe("break-done");
    expect(r.state.phase).toBe("idle");
  });

  it("a late first tick (the phone slept) still finishes the sprint without a halfway cheer", () => {
    const r = tick(startFocus(0, 10), 30 * MIN);
    expect(r.event).toBe("focus-done");
  });

  it("longer sprints earn longer breaks", () => {
    expect(breakMinutes(10)).toBe(2);
    expect(breakMinutes(25)).toBe(5);
  });

  it("idle does nothing", () => {
    expect(tick(IDLE, 99999).event).toBe("none");
    expect(remainingMs(IDLE, 5)).toBe(0);
  });

  it("formats the clock", () => {
    expect(formatClock(10 * MIN)).toBe("10:00");
    expect(formatClock(9 * MIN + 5000)).toBe("9:05");
    expect(formatClock(1)).toBe("0:01");
    expect(formatClock(-5)).toBe("0:00");
  });
});
