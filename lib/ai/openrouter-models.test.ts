import { describe, expect, it } from "vitest";
import { chainWithOverride, OR_CLASS_INFO, OR_CLASSES, OR_TTS, orClassFor, worldOrClassFor } from "./openrouter-models";

describe("OpenRouter model recommendations", () => {
  it("every kind of work has a chain of at least two different models, so one failing never stops a feature", () => {
    for (const c of OR_CLASSES) {
      const chain = OR_CLASS_INFO[c].chain;
      expect(chain.length).toBeGreaterThanOrEqual(2);
      expect(new Set(chain).size).toBe(chain.length);
      for (const m of chain) expect(m).toMatch(/^[a-z0-9.-]+\/[a-z0-9._:-]+$/);
    }
  });

  it("sends each task to the right kind of model", () => {
    expect(orClassFor("sim_build")).toBe("code");
    expect(orClassFor("grading_high_stakes")).toBe("grading");
    expect(orClassFor("tutor_chat")).toBe("chat");
    expect(orClassFor("class_build")).toBe("heavy");
    expect(orClassFor("flashcard_gen")).toBe("bulk");
    expect(orClassFor("something_new")).toBe("bulk");
    expect(worldOrClassFor("ingest_vision")).toBe("vision");
    expect(worldOrClassFor("extract")).toBe("bulk");
  });

  it("an admin's pick goes first and is not tried twice", () => {
    const chain = chainWithOverride("sim_build", "anthropic/claude-sonnet-5.5");
    expect(chain[0]).toBe("anthropic/claude-sonnet-5.5");
    expect(chain.filter((m) => m === "anthropic/claude-sonnet-5.5")).toHaveLength(1);
    expect(chain).toContain("deepseek/deepseek-v4-pro");
    expect(chainWithOverride("sim_build")).toEqual(OR_CLASS_INFO.code.chain);
  });

  it("reading models can see, and the voice list names a voice for both hosts", () => {
    expect(OR_CLASS_INFO.vision.needsImages).toBe(true);
    expect(OR_TTS.voices.female).toBeTruthy();
    expect(OR_TTS.voices.male).toBeTruthy();
    for (const m of OR_TTS.models.slice(1)) expect(OR_TTS.otherVoices[m]).toBeTruthy();
  });
});
