import { describe, it, expect } from "vitest";
import {
  checkLiteralness,
  containsAnswerLeak,
  getAudienceSystemPrompt,
} from "./prompts";

describe("lib/ai/prompts", () => {
  describe("checkLiteralness", () => {
    it("flags non-literal idioms", () => {
      const res = checkLiteralness("Solving this differential equation is a piece of cake!");
      expect(res.isLiteral).toBe(false);
      expect(res.offendingIdiom).toMatch(/piece of cake/i);
    });

    it("passes strictly factual, literal prose", () => {
      const res = checkLiteralness(
        "To solve the linear ODE, multiply both sides by the integrating factor e^(P(x)dx)."
      );
      expect(res.isLiteral).toBe(true);
    });
  });

  describe("containsAnswerLeak", () => {
    it("detects when the stored answer is leaked verbatim", () => {
      const reply = "Great try! But actually the answer is 42 meters per second.";
      expect(containsAnswerLeak(reply, "42 meters per second")).toBe(true);
    });

    it("does not flag general guidance that does not contain the answer", () => {
      const reply = "Remember that kinetic energy equals one half times mass times velocity squared.";
      expect(containsAnswerLeak(reply, "490 Joules")).toBe(false);
    });
  });

  describe("getAudienceSystemPrompt", () => {
    it("includes micro-steps mode for dopamine_step tag", () => {
      const prompt = getAudienceSystemPrompt({ profileTags: ["dopamine_step"] });
      expect(prompt).toContain("MODE: MICRO-STEPS");
    });

    it("includes adversary mode when mastery probability exceeds 0.85", () => {
      const prompt = getAudienceSystemPrompt({ masteryProbability: 0.92 });
      expect(prompt).toContain("MODE: SENIOR REVIEWER / ADVERSARY");
    });

    it("includes teach-the-bot mode for kids tag", () => {
      const prompt = getAudienceSystemPrompt({ classAudienceTags: ["kids"] });
      expect(prompt).toContain("MODE: TEACH-THE-BOT");
    });
  });
});
