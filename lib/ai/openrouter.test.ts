import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase/admin", () => ({ adminDb: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ data: () => ({ key: "sk-or-v1-testkey-1234567890" }) }) }) }) }), Timestamp: { now: () => "now" } }));

import { callOpenRouterChat, looksLikeOpenRouterKey, OpenRouterError, synthesizeOpenRouterSpeech, toMessages } from "./openrouter";

describe("OpenRouter client", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("recognises OpenRouter keys", () => {
    expect(looksLikeOpenRouterKey("sk-or-v1-abcdefghijklmnop")).toBe(true);
    expect(looksLikeOpenRouterKey("gsk_abcdefghijklmnopqrstuvwxyz")).toBe(false);
    expect(looksLikeOpenRouterKey("sk-or-")).toBe(false);
  });

  it("turns a prompt and Gemini-style contents (text and inline pictures) into chat messages", () => {
    const m = toMessages({
      systemInstruction: "Be brief.",
      contents: [{ role: "user", parts: [{ text: "Read this page" }, { inlineData: { mimeType: "image/png", data: "AAAA" } }] }, { role: "model", parts: [{ text: "ok" }] }, "and then?"],
    });
    expect(m[0]).toEqual({ role: "system", content: "Be brief." });
    expect(m[1]).toEqual({ role: "user", content: [{ type: "text", text: "Read this page" }, { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }] });
    expect(m[2]).toEqual({ role: "assistant", content: "ok" });
    expect(m[3]).toEqual({ role: "user", content: "and then?" });
    expect(toMessages({ userPrompt: "hi" })).toEqual([{ role: "user", content: "hi" }]);
    expect(toMessages({})).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("calls the chat endpoint with the key, asks for JSON only from providers that support it, and reads the answer", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({ model: "deepseek/deepseek-v4-flash", choices: [{ message: { content: '{"a":1}' } }], usage: { prompt_tokens: 11, completion_tokens: 5 } }), { status: 200 }));
    const r = await callOpenRouterChat({ model: "deepseek/deepseek-v4-flash", userPrompt: "give json", json: true, maxTokens: 500 });
    expect(r).toMatchObject({ text: '{"a":1}', model: "deepseek/deepseek-v4-flash", tokensIn: 11, tokensOut: 5 });
    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-or-v1-testkey-1234567890");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: "deepseek/deepseek-v4-flash", max_tokens: 500, response_format: { type: "json_object" }, provider: { require_parameters: true } });
  });

  it("raises an error that says whether another model might do better", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "No endpoints found" } }), { status: 404 }));
    await expect(callOpenRouterChat({ model: "x/y", userPrompt: "hi" })).rejects.toMatchObject({ status: 404, modelProblem: true });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 }));
    const err = await callOpenRouterChat({ model: "x/y", userPrompt: "hi" }).catch((e) => e);
    expect(err).toBeInstanceOf(OpenRouterError);
    expect((err as OpenRouterError).modelProblem).toBe(false);
  });

  it("makes speech as MP3 bytes, and gives back null for an error body or a request that fails", async () => {
    const audio = new Uint8Array(2000).fill(7);
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(audio, { status: 200, headers: { "content-type": "audio/mpeg" } }));
    const out = await synthesizeOpenRouterSpeech("Hello there", { model: "hexgrad/kokoro-82m", voice: "af_heart" });
    expect(out?.length).toBe(2000);
    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/audio/speech");
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "hexgrad/kokoro-82m", input: "Hello there", voice: "af_heart", response_format: "mp3" });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: "nope" }), { status: 200, headers: { "content-type": "application/json" } }));
    expect(await synthesizeOpenRouterSpeech("Hello", { model: "m", voice: "v" })).toBeNull();
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("network"));
    expect(await synthesizeOpenRouterSpeech("Hello", { model: "m", voice: "v" })).toBeNull();
  });
});
