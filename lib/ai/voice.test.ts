import { describe, it, expect, vi } from "vitest";
import { pcmToWav, generateGeminiVoice } from "./voice";

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
    expect(alexResult?.voiceName).toBe("Puck");
    expect(alexResult?.mimeType).toBe("audio/wav");
    expect(alexResult?.audioBase64).toBeDefined();

    const samResult = await generateGeminiVoice({
      text: "Let's break down the physical impedance of capacitors.",
      speaker: "Sam",
    });

    expect(samResult?.voiceName).toBe("Fenrir");
  });

  it("gracefully returns null when voice generation fails or text is empty", async () => {
    const empty = await generateGeminiVoice({ text: "", speaker: "Alex" });
    expect(empty).toBeNull();

    const failed = await generateGeminiVoice({ text: "TRIGGER_ERROR", speaker: "Alex" });
    expect(failed).toBeNull();
  });
});
