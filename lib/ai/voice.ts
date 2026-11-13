import { getGeminiClient } from "@/lib/gemini/client";
import { refreshGeminiKey } from "@/lib/ai/api-key";
import { guessSpeechLanguage, languageInfo, speaksWithGemini, type LanguageCode } from "@/lib/i18n/languages";
import { modelFor } from "@/lib/ai/router";
import { Communicate } from "edge-tts-universal";
import { boundariesToTimings, estimateWordTimings, mp3DurationMs, type WordTiming } from "@/lib/voice/word-timing";
import { activeOpenRouterKey, refreshOpenRouterKey, synthesizeOpenRouterSpeech } from "@/lib/ai/openrouter";
import { OR_TTS } from "@/lib/ai/openrouter-models";

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
// failures skip it briefly instead of making every line wait for a timeout.
const edgeState = { failures: 0, downUntil: 0 };
// Gemini TTS has a small daily allowance. When it refuses, stop asking for a couple of minutes instead of burning
// the rest of the allowance (and the tutor's) on lines that will fail anyway.
const geminiTtsState = { downUntil: 0 };
export function resetVoiceBreakers() {
  edgeState.failures = 0;
  edgeState.downUntil = 0;
  geminiTtsState.downUntil = 0;
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
 * The neural voice for a non-English line: the caller's language when known, else a guess from the text itself, so
 * a French or Arabic podcast is never read by an English voice. Undefined for English (callers keep their own voice).
 */
export function languageVoice(text: string, gender: "female" | "male", lang?: LanguageCode | null): string | undefined {
  // an English-speaking learner can still play a French note: guess from the text unless another language was chosen
  const code = lang && lang !== "en" ? lang : guessSpeechLanguage(text);
  if (!code || code === "en") return undefined;
  return languageInfo(code).voices[gender];
}

export async function generateEdgeVoice({
  text,
  speaker,
  lang,
}: {
  text: string;
  speaker: "Alex" | "Sam" | string;
  lang?: LanguageCode | null;
}): Promise<VoiceGenerationResult | null> {
  if (!text || text.trim().length === 0) return null;

  const host = hostFor(speaker);
  const voice = languageVoice(text, host.gender === "female" ? "female" : "male", lang) ?? host.edge;
  const mp3 = (await synthesizeEdgeVoice(text, voice)) || (edgeAvailable() ? await synthesizeEdgeVoice(text, voice) : null);
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
  lang,
}: {
  text: string;
  speaker: "Alex" | "Sam" | string;
  lang?: LanguageCode | null;
}): Promise<VoiceGenerationResult | null> {
  if (!text || text.trim().length === 0) return null;

  // Igbo and Hausa: Gemini's native voice first (the free voices have none for them)
  if (speaksWithGemini(lang) && Date.now() >= geminiTtsState.downUntil) {
    const h = hostFor(speaker);
    const startedAt = Date.now();
    const native = await synthesizeGeminiTts(text, h.gemini, 30_000, true);
    if (native) return native;
    // only a quick refusal (allowance used up) pauses Gemini; a slow line says nothing about the next one
    if (Date.now() - startedAt < 24_000) geminiTtsState.downUntil = Date.now() + 2 * 60_000;
  }

  // Tier 1: Default to Free Studio Edge Neural Voice
  const edgeResult = await generateEdgeVoice({ text, speaker, lang });
  if (edgeResult) {
    return edgeResult;
  }

  const host = hostFor(speaker);
  const voiceName: string = host.gemini;

  // Tier 1b: OpenRouter (cheap open voice) when the free voice is unavailable, English only
  if (!languageVoice(text, host.gender === "female" ? "female" : "male", lang)) {
    const orv = await openRouterVoice(text, host.gender === "female" ? "female" : "male", 25_000);
    if (orv) return { audioBase64: orv.audio.toString("base64"), mimeType: "audio/mpeg", voiceName: orv.voiceName };
  }

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
export function geminiTtsModels(native = false): string[] {
  const configured = modelFor("voice");
  // Igbo and Hausa are on the full Flash TTS model's language list; the Lite model's list isn't published, so a
  // native line goes to Flash first
  const order = native ? ["gemini-3.8-flash-tts", configured] : [configured, "gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts"];
  const list = order.filter(
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
export async function synthesizeGeminiTts(text: string, voiceName: string, timeoutMs = 20_000, native = false): Promise<VoiceGenerationResult | null> {
  if (!text.trim()) return null;
  await refreshGeminiKey();
  let ai: ReturnType<typeof getGeminiClient>;
  try {
    ai = getGeminiClient();
  } catch {
    return null;
  }
  const models = geminiTtsModels(native);
  const perCallMs = Math.max(1_500, Math.floor(timeoutMs / Math.max(1, models.length)));
  for (const model of models) {
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
        perCallMs
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
      perCallMs
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

/**
 * A voice through OpenRouter (an open model such as Kokoro costs a fraction of a cent for a whole podcast line). Used after the free Edge voice
 * and before the dearer ones, for English only: the other languages have their own voices. Null when there is no key or it could not speak.
 */
export async function openRouterVoice(text: string, gender: "female" | "male", timeoutMs = 20_000): Promise<{ audio: Buffer; voiceName: string } | null> {
  await refreshOpenRouterKey();
  if (!activeOpenRouterKey()) return null;
  for (const model of OR_TTS.models.slice(0, 2)) {
    const voice = model === OR_TTS.models[0] ? OR_TTS.voices[gender] : OR_TTS.otherVoices[model]?.[gender];
    if (!voice) continue;
    const audio = await synthesizeOpenRouterSpeech(text, { model, voice }, timeoutMs);
    if (audio) return { audio, voiceName: `${model.split("/")[1]} (OpenRouter)` };
  }
  return null;
}

export interface SpeechClip {
  audio: Buffer;
  mimeType: string;
  engine: "edge" | "openrouter" | "elevenlabs" | "gemini";
}

/**
 * One line of speech as a real audio file. Fast free neural voice first (4 s), then ElevenLabs when a key is
 * set, then Gemini TTS as the last resort. Never the browser's robot voice. Returns null when every engine failed.
 */
export async function synthesizeSpeech(text: string, gender: "female" | "male", edgeVoice?: string, opts: { patient?: boolean; edgeOnly?: boolean; lang?: LanguageCode | null } = {}): Promise<SpeechClip | null> {
  const clean = text.trim();
  if (!clean) return null;
  // Igbo and Hausa: Gemini speaks them natively, the free voices would read them with an English accent
  if (!opts.edgeOnly && speaksWithGemini(opts.lang)) {
    // a whole Igbo/Hausa line takes Gemini 5-30 s: recording a podcast line can wait for it, a live reply can't
    const native = await nativeSpeech(clean, gender, opts.patient ? 40_000 : 12_000);
    if (native) return native;
  }
  // a non-English line gets that language's voice, whatever English voice the caller picked
  const langVoice = languageVoice(clean, gender, opts.lang);
  edgeVoice = langVoice ?? edgeVoice;
  const voices = EDGE_VOICES[gender];
  // Live requests answer fast or give up. Recording a podcast line is not time-critical, and a long lecture turn needs
  // longer than a quick reply, so the time allowed grows with the length of the line.
  const edgeMs = opts.patient ? Math.min(45_000, 8_000 + clean.length * 25) : 5_000;
  const primary = edgeVoice || voices[0];
  const edge = await synthesizeEdgeVoice(clean, primary, edgeMs);
  if (edge) return { audio: edge, mimeType: "audio/mpeg", engine: "edge" };
  // a second Edge attempt costs little and covers a single connection glitch or throttled voice
  if (edgeAvailable()) {
    const retryVoice = langVoice || voices.find((v) => v !== primary) || voices[1];
    const alt = await synthesizeEdgeVoice(clean, retryVoice, edgeMs);
    if (alt) return { audio: alt, mimeType: "audio/mpeg", engine: "edge" };
  }
  // a retry of the free voice must not fall through to the paid engines
  if (opts.edgeOnly) return null;
  // OpenRouter's cheap open voice next (English only)
  if (!langVoice) {
    const orv = await openRouterVoice(clean, gender, opts.patient ? 30_000 : 8_000);
    if (orv) return { audio: orv.audio, mimeType: "audio/mpeg", engine: "openrouter" };
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
        opts.patient ? 30_000 : 8_000
      );
      if (res) return { audio: res, mimeType: "audio/mpeg", engine: "elevenlabs" };
    } catch {
      /* fall through to Gemini */
    }
  }
  if (Date.now() < geminiTtsState.downUntil) return null;
  const geminiMs = opts.patient ? 20_000 : 8_000;
  const startedAt = Date.now();
  const g = await synthesizeGeminiTts(clean, gender === "female" ? HOSTS.alex.gemini : HOSTS.sam.gemini, geminiMs);
  // A quick refusal means the allowance or the service is the problem: pause it. A slow line that timed out says
  // nothing about the next (shorter) request, so it doesn't switch Gemini off for everyone.
  if (!g && Date.now() - startedAt < geminiMs * 0.8) geminiTtsState.downUntil = Date.now() + 2 * 60_000;
  return g ? { audio: Buffer.from(g.audioBase64, "base64"), mimeType: g.mimeType, engine: "gemini" } : null;
}

/**
 * A line in a language only Gemini speaks natively (Igbo, Hausa). Null when Gemini is unavailable, so the caller
 * falls back to a free voice.
 */
async function nativeSpeech(text: string, gender: "female" | "male", timeoutMs: number): Promise<SpeechClip | null> {
  if (Date.now() < geminiTtsState.downUntil) return null;
  const startedAt = Date.now();
  const g = await synthesizeGeminiTts(text, gender === "female" ? HOSTS.alex.gemini : HOSTS.sam.gemini, timeoutMs, true);
  // a quick refusal means the allowance is used up: pause native attempts for everyone for two minutes. A slow
  // line that timed out says nothing about the next one, so it doesn't switch Igbo/Hausa voices off.
  if (!g && Date.now() - startedAt < timeoutMs * 0.6) geminiTtsState.downUntil = Date.now() + 2 * 60_000;
  return g ? { audio: Buffer.from(g.audioBase64, "base64"), mimeType: g.mimeType, engine: "gemini" } : null;
}

/** Synthesises text with a specific Edge neural voice (free, no API key). Returns MP3 bytes. */
export async function synthesizeEdgeVoice(text: string, voice: string, timeoutMs = 6_000): Promise<Buffer | null> {
  if (!text || !text.trim()) return null;
  if (!edgeAvailable()) return null;
  // The Edge websocket can stall without erroring (blocked egress, throttling); never wait forever.
  const out = await withVoiceTimeout(edgeStream(text, voice), timeoutMs);
  if (out) edgeState.failures = 0;
  else if (++edgeState.failures >= 2) edgeState.downUntil = Date.now() + 15_000;
  return out;
}

/**
 * The reading voice ("Sprout"): a small, bright Edge neural voice with the audio and when each word is said. Falls back to estimated word
 * timings if the service sends no boundaries. Uses the same breaker and time limit as the other Edge voices.
 */
export async function synthesizeEdgeWithWords(
  text: string,
  voice: string,
  prosody: { rate?: string; pitch?: string; volume?: string } = {},
  timeoutMs = 9_000
): Promise<{ audio: Buffer; words: WordTiming[]; estimated: boolean } | null> {
  const clean = text.trim();
  if (!clean || !edgeAvailable()) return null;
  const run = async () => {
    try {
      const communicate = new Communicate(clean, { voice, connectionTimeout: 8_000, ...prosody });
      const chunks: Buffer[] = [];
      const marks: Array<{ text?: string; offset?: number; duration?: number }> = [];
      for await (const chunk of communicate.stream()) {
        if (chunk.type === "audio" && chunk.data) chunks.push(chunk.data);
        else if (chunk.type === "WordBoundary") marks.push({ text: chunk.text, offset: chunk.offset, duration: chunk.duration });
      }
      if (!chunks.length) return null;
      const audio = Buffer.concat(chunks);
      const real = boundariesToTimings(marks);
      return { audio, words: real.length ? real : estimateWordTimings(clean, mp3DurationMs(audio.length)), estimated: !real.length };
    } catch (err) {
      console.warn(`[voice] Edge TTS (with words) failed for "${voice}":`, err instanceof Error ? err.message : err);
      return null;
    }
  };
  const out = await withVoiceTimeout(run(), timeoutMs);
  if (out) edgeState.failures = 0;
  else if (++edgeState.failures >= 2) edgeState.downUntil = Date.now() + 15_000;
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
