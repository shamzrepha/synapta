import { describe, it, expect } from "vitest";
import { classifyTaskMode, resolveModelFamily, getModelMasterSkill, withModelMasterSkill } from "./master-skills";

describe("AI model master skills", () => {
  it("classifies creation vs analysis tasks accurately", () => {
    expect(classifyTaskMode("sim_build")).toEqual({ mode: "creating", specialty: "simulation_and_interactive_lab" });
    expect(classifyTaskMode("quiz_gen")).toEqual({ mode: "creating", specialty: "assessment_design" });
    expect(classifyTaskMode("lesson_notes")).toEqual({ mode: "creating", specialty: "pedagogical_authoring" });
    expect(classifyTaskMode("student_evaluation")).toEqual({ mode: "analyzing", specialty: "diagnostic_grading" });
    expect(classifyTaskMode("tutor_chat")).toEqual({ mode: "analyzing", specialty: "socratic_coaching" });
    expect(classifyTaskMode("paper_analysis")).toEqual({ mode: "analyzing", specialty: "deep_synthesis" });
  });

  it("identifies OpenRouter, Groq, and Gemini model families", () => {
    expect(resolveModelFamily("deepseek/deepseek-chat-v3-0324:free")).toBe("deepseek");
    expect(resolveModelFamily("deepseek/deepseek-r1:free")).toBe("deepseek-r1");
    expect(resolveModelFamily("anthropic/claude-3.5-sonnet")).toBe("claude");
    expect(resolveModelFamily("qwen/qwen-2.5-coder-32b-instruct:free")).toBe("qwen-coder");
    expect(resolveModelFamily("meta-llama/llama-3.3-70b-instruct:free")).toBe("llama");
    expect(resolveModelFamily("gemini-2.5-flash-lite")).toBe("gemini-flash-lite");
    expect(resolveModelFamily("gemini-3.1-pro-preview")).toBe("gemini-pro");
    expect(resolveModelFamily("z-ai/glm-4.5-air:free")).toBe("glm");
  });

  it("injects family-specific rules, creation/analysis discipline, and json lock idempotently", () => {
    const skill = getModelMasterSkill({
      task: "sim_build",
      model: "deepseek/deepseek-chat-v3-0324:free",
      jsonMode: true,
    });
    expect(skill).toContain("[MODEL MASTER SKILL · DEEPSEEK V3/CODER · CREATING]");
    expect(skill).toContain("CREATING LABS & 3D/2D ARTIFACTS");
    expect(skill).toContain("JSON LOCK:");

    const r1Skill = getModelMasterSkill({
      task: "student_evaluation",
      model: "deepseek/deepseek-r1",
    });
    expect(r1Skill).toContain("ANALYZING & GRADING WORK");
    expect(r1Skill).toContain("NEVER leak <think>");

    const once = withModelMasterSkill("Base prompt", { task: "tutor_chat", model: "anthropic/claude-3.5-sonnet" });
    const twice = withModelMasterSkill(once, { task: "tutor_chat", model: "openai/gpt-4o" });
    expect(twice).toBe(once);
  });
});
