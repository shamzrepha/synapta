import { describe, it, expect } from "vitest";
import { normaliseVoicePref, DEFAULT_VOICE_PREF } from "@/lib/ai/voice-config";
import { OR_TTS_CHOICES } from "@/lib/ai/openrouter-models";

describe("voice preference", () => {
  it("defaults to the OpenRouter voice first with the cheapest model", () => {
    expect(normaliseVoicePref(undefined)).toEqual(DEFAULT_VOICE_PREF);
    expect(DEFAULT_VOICE_PREF.engine).toBe("openrouter-first");
  });
  it("only accepts listed models and safe voice names", () => {
    const p = normaliseVoicePref({ engine: "edge-first", model: "evil/model", female: "bad name!", male: "leo" });
    expect(p.engine).toBe("edge-first");
    expect(p.model).toBe(OR_TTS_CHOICES[0].model);
    expect(p.female).toBe(OR_TTS_CHOICES[0].female);
    expect(p.male).toBe("leo");
  });
  it("uses the chosen model's own voices", () => {
    const c = OR_TTS_CHOICES[1];
    const p = normaliseVoicePref({ model: c.model });
    expect([p.female, p.male]).toEqual([c.female, c.male]);
  });
});
