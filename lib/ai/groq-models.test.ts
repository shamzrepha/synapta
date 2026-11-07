import { describe, it, expect } from "vitest";
import { pickGroqModels, isModelUnavailable, parseModelList, isHeavyModelName } from "./groq-models";

describe("Groq model choice", () => {
  it("never picks a model the account can't use", () => {
    // the exact failure: llama-3.1-8b-instant is not available to this key
    const available = ["llama-3.3-70b-versatile", "openai/gpt-oss-20b", "whisper-large-v3"];
    const light = pickGroqModels(available, false);
    expect(light).not.toContain("llama-3.1-8b-instant");
    expect(light[0]).toBe("openai/gpt-oss-20b");
    expect(light).not.toContain("whisper-large-v3");
  });
  it("prefers the strong model for heavy work and the fast one for light work", () => {
    const available = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"];
    expect(pickGroqModels(available, true)[0]).toBe("llama-3.3-70b-versatile");
    expect(pickGroqModels(available, false)[0]).toBe("llama-3.1-8b-instant");
  });
  it("falls back to any chat model Groq lists when none of the known ones are there", () => {
    const m = pickGroqModels(["brand-new-chat-model", "whisper-large-v3-turbo", "llama-guard-4-12b"], false);
    expect(m).toEqual(["brand-new-chat-model"]);
  });
  it("tries the known preferences when Groq's list couldn't be read", () => {
    expect(pickGroqModels(null, false)[0]).toBe("llama-3.1-8b-instant");
    expect(pickGroqModels([], true)[0]).toBe("llama-3.3-70b-versatile");
  });
  it("skips models that already failed, tries a bounded number, and honours a requested one that exists", () => {
    const available = ["llama-3.1-8b-instant", "openai/gpt-oss-20b", "llama-3.3-70b-versatile", "gemma2-9b-it", "qwen/qwen3-32b", "x-model"];
    const m = pickGroqModels(available, false, undefined, new Set(["llama-3.1-8b-instant"]));
    expect(m).not.toContain("llama-3.1-8b-instant");
    expect(m.length).toBeLessThanOrEqual(4);
    expect(pickGroqModels(available, false, "qwen/qwen3-32b")[0]).toBe("qwen/qwen3-32b");
    expect(pickGroqModels(available, false, "retired-model")[0]).not.toBe("retired-model");
  });
});

describe("Groq error classification", () => {
  it("treats 'model does not exist or no access' as a model problem", () => {
    expect(isModelUnavailable(404, "x")).toBe(true);
    expect(isModelUnavailable(400, "The model `llama-3.1-8b-instant` does not exist or you do not have access to it.")).toBe(true);
    expect(isModelUnavailable(400, "The model has been decommissioned and is no longer supported.")).toBe(true);
  });
  it("does not treat a bad key or a rate limit as a model problem", () => {
    expect(isModelUnavailable(401, "Invalid API Key")).toBe(false);
    expect(isModelUnavailable(429, "Rate limit reached")).toBe(false);
    expect(isModelUnavailable(500, "internal error")).toBe(false);
  });
});

describe("Groq model list", () => {
  it("reads ids and ignores junk", () => {
    expect(parseModelList({ data: [{ id: "a" }, { id: 5 }, null, { id: "" }, { id: "b" }] })).toEqual(["a", "b"]);
    expect(parseModelList(null)).toEqual([]);
    expect(parseModelList({ data: "x" })).toEqual([]);
  });
  it("recognises strong-model names", () => {
    expect(isHeavyModelName("llama-3.3-70b-versatile")).toBe(true);
    expect(isHeavyModelName("llama-3.1-8b-instant")).toBe(false);
    expect(isHeavyModelName(undefined)).toBe(false);
  });
});
