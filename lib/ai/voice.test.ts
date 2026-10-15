import { describe, it, expect, vi } from "vitest";
import { pcmToWav, generateGeminiVoice } from "./voice";

const edgeState = vi.hoisted(() => ({ fail: true }));

vi.mock("edge-tts-universal", () => ({
  Communicate: class {
    constructor(public text: string) {}
    async *stream() {
      if (edgeState.fail) throw new Error("edge unavailable");
      yield { type: "audio", data: Buffer.from("fakemp3") };
    }
  },
}));

vi.mock("@/lib/gemini/client", () => ({
  getGeminiClient: vi.fn(() => ({
    models: {
      generateContent: vi.fn(async ({ contents }: { contents: string }) => {
        if (contents.includes("TRIGGER_ERROR")) {
          throw new Error("Gemini voice error");
        }
        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: "audio/pcm;rate=24000",
                      data: Buffer.from(new Uint8Array(480)).toString("base64"),
                    },
                  },
                ],
              },
            },
          ],
        };
      }),
    },
  })),
}));

describe("lib/ai/voice default Edge neural voice", () => {
  it("uses free Edge neural voices by default with distinct host voices", async () => {
    edgeState.fail = false;
    const alex = await generateGeminiVoice({ text: "Hello there", speaker: "Alex" });
    const sam = await generateGeminiVoice({ text: "Hi Alex", speaker: "Sam" });
    expect(alex?.mimeType).toBe("audio/mpeg");
    expect(alex?.voiceName).toContain("Jenny");
    expect(sam?.voiceName).toContain("Guy");
    edgeState.fail = true;
  });
});

describe("lib/ai/voice (Google Voice Lab Synthesis)", () => {
  it("pcmToWav constructs valid RIFF/WAV header with specified sample rate and channel", () => {
    const pcmData = Buffer.alloc(960); // 960 bytes of mock PCM
    const wav = pcmToWav(pcmData, 24000, 1, 16);

    expect(wav.length).toBe(44 + 960);
    expect(wav.toString("utf8", 0, 4)).toBe("RIFF");
    expect(wav.toString("utf8", 8, 12)).toBe("WAVE");
    expect(wav.toString("utf8", 12, 16)).toBe("fmt ");
    expect(wav.readUInt16LE(20)).toBe(1); // PCM format
    expect(wav.readUInt16LE(22)).toBe(1); // 1 channel
    expect(wav.readUInt32LE(24)).toBe(24000); // Sample rate
    expect(wav.toString("utf8", 36, 40)).toBe("data");
    expect(wav.readUInt32LE(40)).toBe(960); // Subchunk2Size
  });

  it("generateGeminiVoice selects voice persona and returns WAV audio base64", async () => {
    const alexResult = await generateGeminiVoice({
      text: "Welcome to today's deep dive into circuit physics!",
      speaker: "Alex",
    });

    expect(alexResult).not.toBeNull();
    expect(alexResult?.voiceName).toBe("Kore");
    expect(alexResult?.mimeType).toBe("audio/wav");
    expect(alexResult?.audioBase64).toBeDefined();

    const samResult = await generateGeminiVoice({
      text: "Let's break down the physical impedance of capacitors.",
      speaker: "Sam",
    });

    expect(samResult?.voiceName).toBe("Puck");
  });

  it("gracefully returns null when voice generation fails or text is empty", async () => {
    const empty = await generateGeminiVoice({ text: "", speaker: "Alex" });
    expect(empty).toBeNull();

    const failed = await generateGeminiVoice({ text: "TRIGGER_ERROR", speaker: "Alex" });
    expect(failed).toBeNull();
  });
});

describe("voice timeouts", () => {
  it("withVoiceTimeout resolves null when a provider hangs", async () => {
    const { withVoiceTimeout } = await import("./voice");
    const never = new Promise<string | null>(() => {});
    await expect(withVoiceTimeout(never, 20)).resolves.toBeNull();
  });

  it("withVoiceTimeout turns rejections into null", async () => {
    const { withVoiceTimeout } = await import("./voice");
    await expect(withVoiceTimeout(Promise.reject(new Error("boom")), 1000)).resolves.toBeNull();
  });

  it("uses current Gemini TTS models only", async () => {
    const { geminiTtsModels } = await import("./voice");
    const models = geminiTtsModels();
    expect(models).toContain("gemini-3.8-flash-lite-tts");
    expect(models.every((m) => m.includes("tts") && !m.includes("2.5"))).toBe(true);
  });
});

describe("two distinct podcast hosts", () => {
  it("gives a female and a male voice in every engine", async () => {
    const { HOSTS, hostFor } = await import("./voice");
    expect(hostFor("Alex")).toBe(HOSTS.alex);
    expect(hostFor("Sam")).toBe(HOSTS.sam);
    expect(HOSTS.alex.gender).toBe("female");
    expect(HOSTS.sam.gender).toBe("male");
    expect(HOSTS.alex.edge).not.toBe(HOSTS.sam.edge);
    expect(HOSTS.alex.gemini).not.toBe(HOSTS.sam.gemini);
    expect(HOSTS.alex.slot).not.toBe(HOSTS.sam.slot);
  });

  it("Gemini fallback speaks Alex and Sam with different voices", async () => {
    const { generateGeminiVoice, resetVoiceBreakers } = await import("./voice");
    resetVoiceBreakers();
    const a = await generateGeminiVoice({ text: "Hello there, welcome.", speaker: "Alex" });
    const sam = await generateGeminiVoice({ text: "Thanks Alex, glad to be here.", speaker: "Sam" });
    expect(a?.voiceName).toBe("Kore");
    expect(sam?.voiceName).toBe("Puck");
  });

  it("stops waiting on a blocked Edge service after repeated failures", async () => {
    const { synthesizeEdgeVoice, edgeAvailable, resetVoiceBreakers } = await import("./voice");
    resetVoiceBreakers();
    expect(edgeAvailable()).toBe(true);
    await synthesizeEdgeVoice("one", "en-US-JennyNeural", 50);
    await synthesizeEdgeVoice("two", "en-US-JennyNeural", 50);
    expect(edgeAvailable()).toBe(false);
    resetVoiceBreakers();
  });
});
