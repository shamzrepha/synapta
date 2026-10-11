import { describe, it, expect, vi } from "vitest";
import { runPedagogicalQualityCheck } from "./qualityCheck";

vi.mock("@/lib/ai/router", () => ({
  executeStructuredAiTask: vi.fn(async ({ userPrompt }: { userPrompt: string }) => {
    if (userPrompt.includes("TRIGGER_ERROR")) {
      throw new Error("Upstream Gemini timeout");
    }
    return {
      data: {
        score: 92,
        passed: true,
        issues: [],
      },
    };
  }),
}));

describe("lib/teacher/qualityCheck (Pedagogical Quality Gate)", () => {
  it("returns review report when AI quality check passes", async () => {
    const report = await runPedagogicalQualityCheck({
      lessonMarkdown: "Ohm's Law: V = IR",
      contentPayload: "Calculate current given V=10V and R=5 ohms: I = V/R = 2A",
      kind: "worked_example",
    });

    expect(report.passed).toBe(true);
    expect(report.score).toBe(92);
    expect(report.issues).toEqual([]);
  });

  it("fails closed (passed: false, score: 0) when upstream error occurs", async () => {
    const report = await runPedagogicalQualityCheck({
      lessonMarkdown: "TRIGGER_ERROR",
      contentPayload: "Some drafted content",
      kind: "quiz",
    });

    expect(report.passed).toBe(false);
    expect(report.score).toBe(0);
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.issues[0]).toContain("Manual teacher review required");
  });
});
