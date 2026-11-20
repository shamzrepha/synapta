import { describe, it, expect, vi, beforeEach } from "vitest";

const site = { aiPaused: false, aiPausedMessage: "AI is paused" };
const cap = { over: false, spent: 2, cap: 1.5 };
vi.mock("@/lib/config/site", () => ({ getSiteConfig: async () => site }));
vi.mock("@/lib/ai/openrouter-spend", () => ({ overDailyCap: async () => cap }));

import { assertAiActive, assertUnderSpendCap } from "./guard";

beforeEach(() => {
  site.aiPaused = false;
  cap.over = false;
});

describe("AI guards for routes outside generateWithFallback", () => {
  it("passes when AI is on", async () => {
    await expect(assertAiActive()).resolves.toBeUndefined();
  });
  it("throws AI_PAUSED (503) when the kill switch is on", async () => {
    site.aiPaused = true;
    await expect(assertAiActive()).rejects.toMatchObject({ status: 503, code: "AI_PAUSED" });
  });
  it("throws when the OpenRouter daily cap is reached", async () => {
    cap.over = true;
    await expect(assertUnderSpendCap()).rejects.toMatchObject({ status: 503 });
  });
  it("assertAiActive also enforces the spend cap", async () => {
    cap.over = true;
    await expect(assertAiActive({ spend: true })).rejects.toBeTruthy();
  });
});
