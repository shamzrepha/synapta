import { getGeminiClient } from "@/lib/gemini/client";
import { modelFor } from "@/lib/ai/router";

/**
 * Prepend a standard 44-byte RIFF/WAVE header to raw PCM audio bytes.
 */
export function pcmToWav(
  pcmBuffer: Buffer,
  sampleRate = 24000,
  numChannels = 1,
  bitDepth = 16
): Buffer {
  const byteRate = (sampleRate * numChannels * bitDepth) / 8;
  const blockAlign = (numChannels * bitDepth) / 8;
  const wavHeader = Buffer.alloc(44);

  wavHeader.write("RIFF", 0);
  wavHeader.writeUInt32LE(36 + pcmBuffer.length, 4);
  wavHeader.write("WAVE", 8);
  wavHeader.write("fmt ", 12);
  wavHeader.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  wavHeader.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
  wavHeader.writeUInt16LE(numChannels, 22);
  wavHeader.writeUInt32LE(sampleRate, 24);
  wavHeader.writeUInt32LE(byteRate, 28);
  wavHeader.writeUInt16LE(blockAlign, 32);
  wavHeader.writeUInt16LE(bitDepth, 34);
  wavHeader.write("data", 36);
  wavHeader.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([wavHeader, pcmBuffer]);
}

export interface VoiceGenerationResult {
  audioBase64: string;
  mimeType: string;
  voiceName: string;
}

/**
 * Synthesizes natural spoken dialogue using Google Gemini Voice Lab.
 * Assigns distinct voices to speakers (Alex -> Puck / Aoede; Sam -> Fenrir / Charon).
 */
export async function generateGeminiVoice({
  text,
  speaker,
}: {
  text: string;
  speaker: "Alex" | "Sam" | string;
}): Promise<VoiceGenerationResult | null> {
  if (!text || text.trim().length === 0) return null;

  const isAlex = speaker.toLowerCase().includes("alex");
  const voiceName = isAlex ? "Puck" : "Fenrir";
  const model = modelFor("voice");

  try {
    const ai = getGeminiClient();

    // Request audio output from Gemini Voice
    const response = await ai.models.generateContent({
      model,
      contents: `Speak the following dialogue naturally as podcast host ${speaker}: "${text}"`,
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName,
            },
          },
        },
      },
    });

    const candidates = response.candidates || [];
    if (candidates.length === 0) return null;

    const parts = candidates[0].content?.parts || [];
    // Find audio part
    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        const mimeType = part.inlineData.mimeType || "audio/pcm;rate=24000";
        const rawBuffer = Buffer.from(part.inlineData.data, "base64");

        // If raw PCM, encapsulate in standard WAV container for browser compatibility
        if (mimeType.includes("pcm")) {
          const sampleRate = mimeType.includes("24000") ? 24000 : 16000;
          const wavBuffer = pcmToWav(rawBuffer, sampleRate);
          return {
            audioBase64: wavBuffer.toString("base64"),
            mimeType: "audio/wav",
            voiceName,
          };
        }

        return {
          audioBase64: rawBuffer.toString("base64"),
          mimeType,
          voiceName,
        };
      }
    }

    return null;
  } catch (err) {
    console.warn(`[voice] Gemini voice synthesis fallback for "${speaker}":`, err);
    return null;
  }
}
