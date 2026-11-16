import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/firebase/admin", () => ({ adminDb: () => ({}), Timestamp: { now: () => ({}) } }));
vi.mock("@/lib/ai/router", () => ({ generateWithFallback: vi.fn(), executeStructuredAiTask: vi.fn(), AiGenerationError: class extends Error {} }));
vi.mock("@/lib/quota/guard", () => ({ checkRateLimitAndQuota: vi.fn() }));
vi.mock("@/lib/kc/context", () => ({ loadKcGroundingContext: vi.fn(), scopeRule: () => "" }));
vi.mock("@/lib/studio/design-ai", () => ({ generateDesign: vi.fn() }));

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
  it("preserves studioSpec and treats stale studioSpec locks as ready", () => {
    const studioPiece = {
      status: "generating",
      index: 0,
      objective: "Wire an Ohm's law circuit",
      version: 1,
      generationStartedAt: { toMillis: () => Date.now() - 10 * 60 * 1000 },
      studioSpec: { kind: "circuit", summary: "DC bench", params: [], parts: [], steps: [], tests: [], triggers: [], joints: [] },
      title: "Ohm's Law Bench",
      goal: "Verify V = I * R",
      howTo: ["Wire battery to resistor"],
      concepts: ["Ohm's law"],
      checkQuestion: { question: "What happens when R doubles?", options: ["I halves", "I doubles", "V doubles", "Nothing"], correctIndex: 0, explanation: "I = V/R" },
    } as unknown as StoredPiece;
    const c = toClientPiece(studioPiece);
    expect(c.status).toBe("ready");
    expect(c.studioSpec?.kind).toBe("circuit");
    expect(c.html).toBeUndefined();
    expect(JSON.stringify(c)).not.toContain("correctIndex");
  });
});
