import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/ai/router", async (orig) => ({ ...(await orig<Record<string, unknown>>()), modelFor: () => "gemini-3.8-flash-lite-tts" }));

import { geminiTtsModels } from "./voice";

describe("Gemini speech models", () => {
  it("sends Igbo/Hausa lines to the full Flash TTS model first", () => {
    expect(geminiTtsModels(true)[0]).toBe("gemini-3.8-flash-tts");
    expect(geminiTtsModels(false)[0]).toBe("gemini-3.8-flash-lite-tts");
  });
});
