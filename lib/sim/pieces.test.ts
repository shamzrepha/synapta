import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/firebase/admin", () => ({ adminDb: () => ({}), Timestamp: { now: () => ({}) } }));
vi.mock("@/lib/ai/router", () => ({ generateWithFallback: vi.fn(), AiGenerationError: class extends Error {} }));
vi.mock("@/lib/quota/guard", () => ({ checkRateLimitAndQuota: vi.fn() }));
vi.mock("@/lib/kc/context", () => ({ loadKcGroundingContext: vi.fn(), scopeRule: () => "" }));

import { toClientPiece, type StoredPiece } from "./pieces";

const stored = {
  status: "ready",
  index: 2,
  objective: "Explain damping",
  version: 1,
  html: "<html></html>",
  title: "t",
  goal: "g",
  howTo: ["a"],
  concepts: ["c"],
  checkQuestion: { question: "q?", options: ["a", "b", "c", "d"], correctIndex: 1, explanation: "because" },
} as unknown as StoredPiece;

describe("toClientPiece", () => {
  it("never ships the answer key", () => {
    const c = toClientPiece(stored);
    expect(c.checkQuestion).toEqual({ question: "q?", options: ["a", "b", "c", "d"] });
    expect(JSON.stringify(c)).not.toContain("because");
    expect(JSON.stringify(c)).not.toContain("correctIndex");
  });
  it("keeps the objective and index", () => {
    const c = toClientPiece(stored);
    expect(c.index).toBe(2);
    expect(c.objective).toBe("Explain damping");
  });
});
