import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/ai/router", () => ({ generateWithFallback: vi.fn(), extractJsonPayload: vi.fn() }));

import { ideasCacheKey } from "./ai-build";

describe("ideasCacheKey", () => {
  it("is stable for the same topic, whatever the case or spacing, so the list is generated once", () => {
    const a = ideasCacheKey({ topic: "Ohm's Law", level: "beginner" });
    expect(ideasCacheKey({ topic: "  ohm's   LAW ", level: "Beginner" })).toBe(a);
    expect(ideasCacheKey({ topic: "Ohm's Law" })).toBe(a);
  });
  it("differs by topic, description and level, and is a safe Firestore id", () => {
    const a = ideasCacheKey({ topic: "Ohm's Law" });
    expect(ideasCacheKey({ topic: "Ohm's Law", level: "advanced" })).not.toBe(a);
    expect(ideasCacheKey({ topic: "Kirchhoff" })).not.toBe(a);
    expect(ideasCacheKey({ topic: "Ohm's Law", description: "series circuits" })).not.toBe(a);
    expect(a).toMatch(/^studio_ideas:v1:[0-9a-f]{32}$/);
    expect(a).not.toContain("/");
  });
});
