import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ data: () => undefined }), set: async () => undefined, delete: async () => undefined }) }) }),
  Timestamp: { now: () => ({ toDate: () => new Date("2026-11-07T10:00:00Z") }) },
}));

import { callGroqChat, testGroqKey } from "./groq";

const KEY = "gsk_" + "k".repeat(48) + "9876";
type Call = { url: string; model?: string };

/** A pretend Groq: serves the models list, and answers chat only for the models in `works`. */
function fakeGroq(listed: string[], works: string[], calls: Call[]) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/models")) {
      calls.push({ url });
      return new Response(JSON.stringify({ data: listed.map((id) => ({ id })) }), { status: 200 });
    }
    const model = JSON.parse(String(init?.body)).model as string;
    calls.push({ url, model });
    if (!works.includes(model)) {
      return new Response(JSON.stringify({ error: { message: `The model \`${model}\` does not exist or you do not have access to it.` } }), { status: 404 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: "hello" } }], usage: { prompt_tokens: 3, completion_tokens: 2 } }), { status: 200 });
  });
}

describe("Groq chat falls back across models", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.GROQ_API_KEY = KEY;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.GROQ_API_KEY;
  });

  it("answers with the model the account has when the usual fast one is missing", async () => {
    const calls: Call[] = [];
    globalThis.fetch = fakeGroq(["llama-3.3-70b-versatile", "openai/gpt-oss-20b"], ["openai/gpt-oss-20b", "llama-3.3-70b-versatile"], calls) as unknown as typeof fetch;
    const r = await callGroqChat({ model: "llama-3.1-8b-instant", userPrompt: "hi" });
    expect(r.text).toBe("hello");
    expect(r.model).not.toBe("llama-3.1-8b-instant");
    expect(calls.some((c) => c.model === "llama-3.1-8b-instant")).toBe(false);
  });

  it("moves on to the next model when the first one is refused, and remembers the bad one", async () => {
    const calls: Call[] = [];
    process.env.GROQ_API_KEY = "gsk_" + "z".repeat(48) + "5555"; // its own key: the model list is cached per key
    // Groq lists a model it then refuses to run
    globalThis.fetch = fakeGroq(["llama-3.1-8b-instant-ghost", "llama-3.3-70b-versatile"], ["llama-3.3-70b-versatile"], calls) as unknown as typeof fetch;
    const r = await callGroqChat({ userPrompt: "hi", model: "llama-3.1-8b-instant-ghost" });
    expect(r.model).toBe("llama-3.3-70b-versatile");
    expect(calls.filter((c) => c.model === "llama-3.1-8b-instant-ghost").length).toBe(1);
  });

  it("does not hide a real error such as a bad key", async () => {
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.endsWith("/models")) return new Response("{}", { status: 401 });
      return new Response(JSON.stringify({ error: { message: "Invalid API Key" } }), { status: 401 });
    }) as unknown as typeof fetch;
    await expect(callGroqChat({ userPrompt: "hi" })).rejects.toThrow(/Invalid API Key/);
  });
});

describe("Groq key check", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("accepts a working key even when the fast model is not available to it", async () => {
    globalThis.fetch = fakeGroq(["llama-3.3-70b-versatile"], ["llama-3.3-70b-versatile"], []) as unknown as typeof fetch;
    expect(await testGroqKey(KEY)).toBeNull();
  });
  it("still rejects a wrong key in plain words", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Invalid API Key" } }), { status: 401 })) as unknown as typeof fetch;
    expect(await testGroqKey(KEY)).toMatch(/rejected this API key/);
  });
});
