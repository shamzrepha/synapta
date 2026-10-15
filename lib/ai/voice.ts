import { getGeminiClient } from "@/lib/gemini/client";
import { modelFor } from "@/lib/ai/router";
import { Communicate } from "edge-tts-universal";

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

export interface DialogueTurn {
  speaker: string;
  text: string;
}

export interface FullAudioResult {
  turns: Array<{
    index: number;
    speaker: string;
    text: string;
    audioBase64: string;
    mimeType: string;
    voiceName: string;
  }>;
}

/**
 * Default Free Neural Voice Synthesizer using Edge TTS.
 * Zero API keys required; high-fidelity studio dual-host voices:
 * - Alex (Host 1): en-US-JennyNeural (Warm, clear female tone)
 * - Sam (Host 2): en-US-GuyNeural (Engaging, articulate male tone)
 */
export async function generateEdgeVoice({
  text,
  speaker,
}: {
  text: string;
  speaker: "Alex" | "Sam" | string;
}): Promise<VoiceGenerationResult | null> {
  if (!text || text.trim().length === 0) return null;

  const isAlex = speaker.toLowerCase().includes("alex");
  const voice = isAlex ? "en-US-JennyNeural" : "en-US-GuyNeural";
  const voiceName = isAlex ? "Jenny (Studio Neural)" : "Guy (Studio Neural)";

  try {
    const communicate = new Communicate(text.trim(), { voice });
    const audioChunks: Buffer[] = [];

    for await (const chunk of communicate.stream()) {
      if (chunk.type === "audio" && chunk.data) {
        audioChunks.push(chunk.data);
      }
    }

    if (audioChunks.length === 0) return null;

    const audioBuffer = Buffer.concat(audioChunks);
    return {
      audioBase64: audioBuffer.toString("base64"),
      mimeType: "audio/mpeg",
      voiceName,
    };
  } catch (edgeErr) {
    console.warn(`[voice] Edge TTS failed for speaker "${speaker}":`, edgeErr);
    return null;
  }
}

/**
 * Converts the entire generated 2-host podcast script into audio.
 * Synthesizes all speaker turns in sequence with Edge Neural Voice.
 */
export async function generateFullDiscussionAudio(
  dialogue: DialogueTurn[]
): Promise<FullAudioResult> {
  const results: Array<FullAudioResult["turns"][number] | null> = new Array(dialogue.length).fill(null);
  const CONCURRENCY = 5;

  for (let start = 0; start < dialogue.length; start += CONCURRENCY) {
    const batch = dialogue.slice(start, start + CONCURRENCY);
    await Promise.all(
      batch.map(async (item, offset) => {
        const i = start + offset;
        if (!item || !item.text) return;
        // Free Edge neural voice first; generateGeminiVoice itself tries Edge, then ElevenLabs/Gemini.
        const voiceRes = await generateGeminiVoice({ text: item.text, speaker: item.speaker });
        if (voiceRes) {
          results[i] = {
            index: i,
            speaker: item.speaker,
            text: item.text,
            audioBase64: voiceRes.audioBase64,
            mimeType: voiceRes.mimeType,
            voiceName: voiceRes.voiceName,
          };
        }
      })
    );
  }

  return { turns: results.filter((t): t is FullAudioResult["turns"][number] => t !== null) };
}

/**
 * Universal voice generator:
 * 1. Default: Free Edge Neural Voices (Jenny & Guy)
 * 2. Secondary: ElevenLabs (if ELEVENLABS_API_KEY provided)
 * 3. Tertiary: Google Gemini Voice Lab (gemini-2.5-flash-preview-tts)
 */
export async function generateGeminiVoice({
  text,
  speaker,
}: {
  text: string;
  speaker: "Alex" | "Sam" | string;
}): Promise<VoiceGenerationResult | null> {
  if (!text || text.trim().length === 0) return null;

  // Tier 1: Default to Free Studio Edge Neural Voice
  const edgeResult = await generateEdgeVoice({ text, speaker });
  if (edgeResult) {
    return edgeResult;
  }

  const isAlex = speaker.toLowerCase().includes("alex");
  const voiceName = isAlex ? "Puck" : "Fenrir";

  // Tier 2: ElevenLabs API (if ELEVENLABS_API_KEY configured)
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  if (elevenLabsKey) {
    try {
      const voiceId = isAlex ? "21m00Tcm4TlvDq8ikWAM" : "pNInz6obpgDQGcFmaJgB";
      const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": elevenLabsKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      });

      if (elRes.ok) {
        const audioBuffer = Buffer.from(await elRes.arrayBuffer());
        return {
          audioBase64: audioBuffer.toString("base64"),
          mimeType: "audio/mpeg",
          voiceName: isAlex ? "Rachel (ElevenLabs)" : "Adam (ElevenLabs)",
        };
      }
    } catch (elErr) {
      console.warn("[voice] ElevenLabs synthesis failed, falling back to Gemini Voice Lab:", elErr);
    }
  }

  // Tier 3: Google Gemini Voice Lab
  const configuredModel = modelFor("voice");
  const model = (!configuredModel || configuredModel === "gemini-3.8-live")
    ? "gemini-2.5-flash-preview-tts"
    : configuredModel;

  try {
    const ai = getGeminiClient();

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
    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        const mimeType = part.inlineData.mimeType || "audio/pcm;rate=24000";
        const rawBuffer = Buffer.from(part.inlineData.data, "base64");

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

/** Synthesises text with a specific Edge neural voice (free, no API key). Returns MP3 bytes. */
export async function synthesizeEdgeVoice(text: string, voice: string): Promise<Buffer | null> {
  if (!text || !text.trim()) return null;
  try {
    const communicate = new Communicate(text.trim(), { voice });
    const chunks: Buffer[] = [];
    for await (const chunk of communicate.stream()) {
      if (chunk.type === "audio" && chunk.data) chunks.push(chunk.data);
    }
    return chunks.length ? Buffer.concat(chunks) : null;
  } catch (err) {
    console.warn(`[voice] Edge TTS failed for voice "${voice}":`, err instanceof Error ? err.message : err);
    return null;
  }
}
