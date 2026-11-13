import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }), set: async () => {} }) }) }),
  Timestamp: { now: () => ({ toMillis: () => Date.now(), toDate: () => new Date() }) },
}));
vi.mock("@/lib/gemini/client", () => ({ getGeminiClient: () => ({ models: { generateContent: async () => { throw new Error("Gemini must not be called"); } } }) }));
vi.mock("@/lib/ai/groq", () => ({
  getActiveAiProvider: async () => "openrouter",
  activeGroqKey: () => "",
  refreshGroqKey: async () => {},
  callGroqChat: async () => { throw new Error("Groq must not be called"); },
}));
const callOpenRouterChat = vi.fn();
vi.mock("@/lib/ai/openrouter", () => ({
  activeOpenRouterKey: () => "sk-or-test",
  refreshOpenRouterKey: async () => {},
  callOpenRouterChat: (...a: unknown[]) => callOpenRouterChat(...a),
  OpenRouterError: class extends Error { constructor(m: string, public status: number) { super(m); } },
}));
vi.mock("@/lib/ai/openrouter-assign", () => ({ openRouterChainFor: async () => ["deepseek/deepseek-v4-flash", "anthropic/claude-haiku-5.5"] }));

import { generateWithFallback } from "./router";

describe("router with OpenRouter as the active engine", () => {
  beforeEach(() => callOpenRouterChat.mockReset());

  it("answers with the first recommended model and reports which one answered", async () => {
    callOpenRouterChat.mockResolvedValueOnce({ text: '{"ok":true}', model: "deepseek/deepseek-v4-flash", tokensIn: 10, tokensOut: 4, latencyMs: 5 });
    const r = await generateWithFallback({ task: "quiz_gen", userPrompt: "make a quiz", schema: z.object({ ok: z.boolean() }), learnerLanguage: false });
    expect(r.data).toEqual({ ok: true });
    expect(r.modelUsed).toBe("deepseek/deepseek-v4-flash");
    expect(callOpenRouterChat.mock.calls[0][0]).toMatchObject({ model: "deepseek/deepseek-v4-flash", json: true });
  });

  it("moves to the next model when the first answers in the wrong shape", async () => {
    callOpenRouterChat
      .mockResolvedValueOnce({ text: '{"nope":1}', model: "deepseek/deepseek-v4-flash", tokensIn: 1, tokensOut: 1, latencyMs: 1 })
      .mockResolvedValueOnce({ text: '{"ok":true}', model: "anthropic/claude-haiku-5.5", tokensIn: 1, tokensOut: 1, latencyMs: 1 });
    const r = await generateWithFallback({ task: "quiz_gen", userPrompt: "make a quiz", schema: z.object({ ok: z.boolean() }), learnerLanguage: false });
    expect(r.modelUsed).toBe("anthropic/claude-haiku-5.5");
    expect(r.fallbackTriggered).toBe(true);
    expect(callOpenRouterChat).toHaveBeenCalledTimes(2);
  });
});
