import { describe, it, expect, vi, beforeEach } from "vitest";
import { modelFor, fallbackModel, sanitizeModelId } from "./router";

describe("lib/ai/router", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns default models for defined tasks", () => {
    expect(modelFor("tutor_chat")).toBe("gemini-3.5-flash-lite");
    expect(modelFor("structured_spec")).toBe("gemini-3.8-flash");
    expect(modelFor("grading_high_stakes")).toBe("gemini-3.8-flash");
    expect(modelFor("long_document")).toBe("gemini-3.8-flash");
    expect(modelFor("voice")).toBe("gemini-3.8-live");
    expect(fallbackModel()).toBe("gemini-3.8-flash");
  });

  it("falls back to fallbackModel for unknown task", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(modelFor("unknown_task" as any)).toBe("gemini-3.8-flash");
  });

  it("sanitizes legacy or deprecated Gemini model identifiers", () => {
    expect(sanitizeModelId("gemini-2.5-flash")).toBe("gemini-3.8-flash");
    expect(sanitizeModelId("gemini-2.0-flash")).toBe("gemini-3.8-flash");
    expect(sanitizeModelId("gemini-1.5-flash")).toBe("gemini-3.8-flash");
    expect(sanitizeModelId("gemini-1.5-pro")).toBe("gemini-3.8-flash");
    expect(sanitizeModelId("models/gemini-2.5-flash")).toBe("gemini-3.8-flash");
    expect(sanitizeModelId(undefined)).toBe("gemini-3.8-flash");
    expect(sanitizeModelId("")).toBe("gemini-3.8-flash");
    expect(sanitizeModelId("gemini-3.8-flash")).toBe("gemini-3.8-flash");
    expect(sanitizeModelId("gemini-3.5-flash-lite")).toBe("gemini-3.5-flash-lite");
  });
});
