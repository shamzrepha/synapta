import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/firebase/admin", () => ({ adminDb: vi.fn(), Timestamp: { now: vi.fn() } }));
vi.mock("@/lib/ai/router", () => ({ generateWithFallback: vi.fn() }));
vi.mock("@/lib/quota/guard", () => ({ checkRateLimitAndQuota: vi.fn() }));

import { normalizeHistory } from "./orchestrator";

describe("tutor history normalisation", () => {
  it("drops a leading welcome message and empty turns", () => {
    const out = normalizeHistory([
      { role: "model", text: "Welcome! Ask me anything." },
      { role: "user", text: "What is inertia?" },
      { role: "model", text: "" },
      { role: "model", text: "Inertia is resistance to changes in motion." },
    ]);
    expect(out.map((t) => t.role)).toEqual(["user", "model"]);
    expect(out[0].parts[0].text).toBe("What is inertia?");
  });

  it("merges consecutive turns from the same side and ends on a model turn", () => {
    const out = normalizeHistory([
      { role: "user", text: "a" },
      { role: "user", text: "b" },
      { role: "model", text: "c" },
      { role: "user", text: "unanswered (previous request failed)" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].parts[0].text).toBe("a\n\nb");
    expect(out[1].role).toBe("model");
  });

  it("keeps at most 10 turns and always starts with the user", () => {
    const long = Array.from({ length: 30 }, (_, i) => ({ role: (i % 2 ? "model" : "user") as "user" | "model", text: `t${i}` }));
    const out = normalizeHistory(long);
    expect(out.length).toBeLessThanOrEqual(10);
    expect(out[0].role).toBe("user");
    expect(out[out.length - 1].role).toBe("model");
  });
});
