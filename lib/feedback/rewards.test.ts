import { describe, it, expect } from "vitest";
import { giftedExpiryMs, rewardLabel, validReward } from "./rewards";

describe("feedback rewards", () => {
  it("only offers the set amounts", () => {
    expect(validReward("xp", 100)).toBe(true);
    expect(validReward("xp", 99999)).toBe(false);
    expect(validReward("plan_days", 30)).toBe(true);
    expect(validReward("plan_days", 5)).toBe(false);
  });
  it("adds plan days from the current expiry, or from now when it has lapsed", () => {
    const now = 1_000 * 86_400_000;
    expect(giftedExpiryMs(now + 10 * 86_400_000, 30, now)).toBe(now + 40 * 86_400_000);
    expect(giftedExpiryMs(now - 5 * 86_400_000, 7, now)).toBe(now + 7 * 86_400_000);
    expect(giftedExpiryMs(0, 7, now)).toBe(now + 7 * 86_400_000);
  });
  it("describes a reward", () => {
    expect(rewardLabel("xp", 250)).toBe("250 XP");
    expect(rewardLabel("plan_days", 30)).toBe("30 days of the Student plan");
  });
});
