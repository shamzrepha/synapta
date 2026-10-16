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

/**
 * The two podcast hosts. Every engine gets one female (Alex) and one male (Sam) voice so the
 * conversation is easy to follow, whichever engine ends up speaking.
 */
export const HOSTS = {
  alex: { gender: "female", edge: "en-US-AriaNeural", edgeName: "Aria (Studio Neural)", gemini: "Kore", eleven: "21m00Tcm4TlvDq8ikWAM", elevenName: "Rachel (ElevenLabs)", slot: "A" },
  sam: { gender: "male", edge: "en-US-AndrewMultilingualNeural", edgeName: "Andrew (Studio Neural)", gemini: "Puck", eleven: "pNInz6obpgDQGcFmaJgB", elevenName: "Adam (ElevenLabs)", slot: "B" },
} as const;

export function hostFor(speaker: string) {
  return /alex/i.test(speaker) ? HOSTS.alex : HOSTS.sam;
}

// Edge TTS can be blocked from some datacenters (it then times out on every line). After repeated
// failures skip it for a while instead of making every line wait for a timeout.
const edgeState = { failures: 0, downUntil: 0 };
export function resetVoiceBreakers() {
  edgeState.failures = 0;
  edgeState.downUntil = 0;
}
export function edgeAvailable(): boolean {
  const engine = (process.env.VOICE_ENGINE || "auto").toLowerCase();
  if (engine === "gemini") return false;
  return Date.now() >= edgeState.downUntil;
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

  const host = hostFor(speaker);
  const mp3 = await synthesizeEdgeVoice(text, host.edge);
  return mp3 ? { audioBase64: mp3.toString("base64"), mimeType: "audio/mpeg", voiceName: host.edgeName } : null;
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
 * 3. Tertiary: Google Gemini TTS (gemini-3.8-flash-lite-tts → gemini-3.8-flash-tts)
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

  const host = hostFor(speaker);
  const voiceName: string = host.gemini;

  // Tier 2: ElevenLabs API (if ELEVENLABS_API_KEY configured)
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  if (elevenLabsKey) {
    try {
      const voiceId = host.eleven;
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
          voiceName: host.elevenName,
        };
      }
    } catch (elErr) {
      console.warn("[voice] ElevenLabs synthesis failed, falling back to Gemini Voice Lab:", elErr);
    }
  }

  // Tier 3: Google Gemini TTS
  return synthesizeGeminiTts(text, voiceName);
}

/** Resolves after `ms` with null so a hung provider can't stall a request. */
export function withVoiceTimeout<T>(p: Promise<T | null>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(null);
      }
    );
  });
}

/** Current Gemini TTS models (2.5 preview TTS was retired); first one that answers wins. */
export function geminiTtsModels(): string[] {
  const configured = modelFor("voice");
  const list = [configured, "gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts"].filter(
    (m): m is string => !!m && m.includes("tts")
  );
  return Array.from(new Set(list));
}

function audioFromBase64(data: string, mimeType: string, voiceName: string): VoiceGenerationResult {
  const raw = Buffer.from(data, "base64");
  // Raw PCM (older models / audio/l16) needs a WAV header to play in browsers
  if (/pcm|l16/i.test(mimeType)) {
    const rate = Number(/rate=(\d+)/.exec(mimeType)?.[1]) || 24000;
    return { audioBase64: pcmToWav(raw, rate).toString("base64"), mimeType: "audio/wav", voiceName };
  }
  return { audioBase64: raw.toString("base64"), mimeType: mimeType || "audio/wav", voiceName };
}

/**
 * Speaks `text` with a Gemini prebuilt voice (e.g. Puck, Kore, Fenrir). Uses the Interactions API
 * that the 3.8 TTS models expect, falling back to generateContent for older SDK/model combinations.
 */
export async function synthesizeGeminiTts(text: string, voiceName: string, timeoutMs = 20_000): Promise<VoiceGenerationResult | null> {
  if (!text.trim()) return null;
  let ai: ReturnType<typeof getGeminiClient>;
  try {
    ai = getGeminiClient();
  } catch {
    return null;
  }
  for (const model of geminiTtsModels()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const interactions = (ai as any).interactions;
    if (interactions?.create) {
      const res = await withVoiceTimeout<VoiceGenerationResult>(
        interactions
          .create({
            model,
            input: [{ type: "user_input", content: [{ type: "text", text: text.trim() }] }],
            response_format: { type: "audio" },
            generation_config: { speech_config: [{ voice: voiceName }] },
          })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .then((r: any) => (r?.output_audio?.data ? audioFromBase64(r.output_audio.data, r.output_audio.mime_type || "audio/wav", voiceName) : null)),
        timeoutMs
      );
      if (res) return res;
    }
    const legacy = await withVoiceTimeout<VoiceGenerationResult>(
      ai.models
        .generateContent({
          model,
          contents: text.trim(),
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
          },
        })
        .then((response) => {
          for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData?.data) return audioFromBase64(part.inlineData.data, part.inlineData.mimeType || "audio/pcm;rate=24000", voiceName);
          }
          return null;
        }),
      timeoutMs
    );
    if (legacy) return legacy;
  }
  console.warn("[voice] Gemini TTS unavailable for all models");
  return null;
}

/** Fast free neural voices (Microsoft Edge), tried first everywhere. */
export const EDGE_VOICES = {
  female: ["en-US-AriaNeural", "en-US-JennyNeural", "en-US-AvaMultilingualNeural", "en-GB-SoniaNeural"],
  male: ["en-US-AndrewMultilingualNeural", "en-US-BrianMultilingualNeural", "en-US-GuyNeural", "en-GB-RyanNeural"],
} as const;

export interface SpeechClip {
  audio: Buffer;
  mimeType: string;
  engine: "edge" | "elevenlabs" | "gemini";
}

/**
 * One line of speech as a real audio file. Fast free neural voice first (4 s), then ElevenLabs when a key is
 * set, then Gemini TTS as the last resort. Never the browser's robot voice. Returns null when every engine failed.
 */
export async function synthesizeSpeech(text: string, gender: "female" | "male", edgeVoice?: string): Promise<SpeechClip | null> {
  const clean = text.trim();
  if (!clean) return null;
  const voices = EDGE_VOICES[gender];
  const edge = await synthesizeEdgeVoice(clean, edgeVoice || voices[0], 4_000);
  if (edge) return { audio: edge, mimeType: "audio/mpeg", engine: "edge" };
  // a second Edge voice costs little and covers a single voice being throttled
  if (!edgeVoice && edgeAvailable()) {
    const alt = await synthesizeEdgeVoice(clean, voices[1], 4_000);
    if (alt) return { audio: alt, mimeType: "audio/mpeg", engine: "edge" };
  }
  const key = process.env.ELEVENLABS_API_KEY;
  if (key) {
    try {
      const id = gender === "female" ? HOSTS.alex.eleven : HOSTS.sam.eleven;
      const res = await withVoiceTimeout(
        fetch(`https://api.elevenlabs.io/v1/text-to-speech/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "xi-api-key": key },
          body: JSON.stringify({ text: clean, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
        }).then(async (r) => (r.ok ? Buffer.from(await r.arrayBuffer()) : null)),
        8_000
      );
      if (res) return { audio: res, mimeType: "audio/mpeg", engine: "elevenlabs" };
    } catch {
      /* fall through to Gemini */
    }
  }
  const g = await synthesizeGeminiTts(clean, gender === "female" ? HOSTS.alex.gemini : HOSTS.sam.gemini, 12_000);
  return g ? { audio: Buffer.from(g.audioBase64, "base64"), mimeType: g.mimeType, engine: "gemini" } : null;
}

/** Synthesises text with a specific Edge neural voice (free, no API key). Returns MP3 bytes. */
export async function synthesizeEdgeVoice(text: string, voice: string, timeoutMs = 6_000): Promise<Buffer | null> {
  if (!text || !text.trim()) return null;
  if (!edgeAvailable()) return null;
  // The Edge websocket can stall without erroring (blocked egress, throttling); never wait forever.
  const out = await withVoiceTimeout(edgeStream(text, voice), timeoutMs);
  if (out) edgeState.failures = 0;
  else if (++edgeState.failures >= 2) edgeState.downUntil = Date.now() + 10 * 60_000;
  return out;
}

async function edgeStream(text: string, voice: string): Promise<Buffer | null> {
  try {
    const communicate = new Communicate(text.trim(), { voice, connectionTimeout: 8_000 });
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
