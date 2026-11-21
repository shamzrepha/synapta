import { describe, expect, it } from "vitest";
import { BLINK_MAX_MS, BLINK_MIN_MS, BURST_FRAMES, burstFrame, isFaviconEvent, nextBlinkDelay, staticFrame, tooSoon } from "./frames";
import { PALETTES } from "@/lib/pet/mood";

describe("favicon frames", () => {
  it("uses the pet palette and mood badge", () => {
    expect(staticFrame("fired").body).toBe(PALETTES.fired.body);
    expect(staticFrame("fired").badge).toBe("flame");
    expect(staticFrame("sleepy").badge).toBe("z");
    expect(staticFrame("sleepy").eyes).toBe("closed");
    expect(staticFrame("calm").ring).toBeNull();
    expect(staticFrame("calm", true).eyes).toBe("closed");
  });
  it("bursts end after BURST_FRAMES", () => {
    for (const e of ["correct", "streak", "levelup", "sleepy"] as const) {
      expect(burstFrame("calm", e, 0)).not.toBeNull();
      expect(burstFrame("calm", e, BURST_FRAMES - 1)).not.toBeNull();
      expect(burstFrame("calm", e, BURST_FRAMES)).toBeNull();
    }
    expect(BURST_FRAMES).toBeGreaterThanOrEqual(6);
    expect(BURST_FRAMES).toBeLessThanOrEqual(10);
    expect(burstFrame("calm", "correct", -1)).toBeNull();
  });
  it("correct shows a spark, streak a flame", () => {
    expect(burstFrame("calm", "correct", 1)?.badge).toBe("spark");
    expect(burstFrame("calm", "streak", 2)?.badge).toBe("flame");
  });
  it("blink delay stays in 6-10 s", () => {
    expect(nextBlinkDelay(0)).toBe(BLINK_MIN_MS);
    expect(nextBlinkDelay(1)).toBe(BLINK_MAX_MS);
    expect(nextBlinkDelay(5)).toBe(BLINK_MAX_MS);
  });
  it("throttles draws and validates events", () => {
    expect(tooSoon(1100, 1000)).toBe(true);
    expect(tooSoon(1150, 1000)).toBe(false);
    expect(isFaviconEvent("levelup")).toBe(true);
    expect(isFaviconEvent("x")).toBe(false);
  });
});
