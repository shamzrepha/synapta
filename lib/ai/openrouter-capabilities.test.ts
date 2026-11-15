import { afterEach, describe, expect, it, vi } from "vitest";
import {
  callOpenRouterChat,
  openRouterSupportsReasoning,
  openRouterSupportsTemperature,
} from "./openrouter";

describe("OpenRouter model parameter & response handling", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.OPENROUTER_API_KEY;
  });

  it("omits temperature for Claude 5.x / GPT-5 / o-series and enables bounded reasoning only for reasoning models", () => {
    expect(openRouterSupportsTemperature("anthropic/claude-sonnet-5.5")).toBe(false);
    expect(openRouterSupportsTemperature("anthropic/claude-haiku-5.5")).toBe(false);
    expect(openRouterSupportsTemperature("qwen/qwen3-coder")).toBe(true);
    expect(openRouterSupportsTemperature("deepseek/deepseek-v4-pro")).toBe(true);

    expect(openRouterSupportsReasoning("anthropic/claude-sonnet-5.5")).toBe(true);
    expect(openRouterSupportsReasoning("deepseek/deepseek-v4-pro")).toBe(true);
    expect(openRouterSupportsReasoning("qwen/qwen3-coder")).toBe(false);
    expect(openRouterSupportsReasoning("qwen/qwen3-coder-next")).toBe(false);
    expect(openRouterSupportsReasoning("openai/gpt-4.1")).toBe(false);
  });

  it("sends reasoning effort and strips temperature for anthropic/claude-sonnet-5.5", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-v1-test-key-1234567890";
    let sentBody: Record<string, unknown> = {};
    globalThis.fetch = vi.fn(async (_url, init) => {
      sentBody = JSON.parse(String(init?.body || "{}"));
      return new Response(
        JSON.stringify({
          model: "anthropic/claude-sonnet-5.5",
          choices: [{ message: { content: "<think>plan</think><html>ok</html>" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    const out = await callOpenRouterChat({
      model: "anthropic/claude-sonnet-5.5",
      userPrompt: "build",
      temperature: 0.6,
      maxTokens: 24_000,
      reasoningEffort: "low",
    });

    expect(sentBody.temperature).toBeUndefined();
    expect(sentBody.reasoning).toEqual({ effort: "low", exclude: true });
    expect(out.text).toBe("<html>ok</html>");
  });

  it("surfaces diagnostic finish_reason and reasoning token usage when content is empty", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-v1-test-key-1234567890";
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: "length", message: { content: "" } }],
          usage: { prompt_tokens: 100, completion_tokens: 4000, completion_tokens_details: { reasoning_tokens: 4000 } },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    ) as typeof fetch;

    await expect(
      callOpenRouterChat({ model: "deepseek/deepseek-v4-pro", userPrompt: "build" })
    ).rejects.toMatchObject({
      status: 502,
      modelProblem: true,
      message: expect.stringMatching(/empty answer.*finish=length.*reasoning=4000/),
    });
  });

  it("surfaces choice-level provider errors cleanly", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-v1-test-key-1234567890";
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ error: { message: "Upstream provider disconnected", code: 503 }, message: { content: "" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    ) as typeof fetch;

    await expect(
      callOpenRouterChat({ model: "deepseek/deepseek-v4-pro", userPrompt: "build" })
    ).rejects.toMatchObject({
      status: 503,
      modelProblem: true,
      message: "Upstream provider disconnected",
    });
  });
});
