import { createHash } from "node:crypto";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { synthesizeSpeech } from "@/lib/ai/voice";
import type { SprintItem } from "./sprint";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/** What the voice says for a question. Objective: the stem and each option. Written: the question, and for a calculation the paper instruction. */
export function spokenText(item: SprintItem): string {
  if (item.kind === "cbt") {
    const opts = item.options.map((o, i) => `Option ${LETTERS[i] ?? i + 1}. ${o}`).join(". ");
    return `${item.stem}. ${opts}.`.replace(/\s+/g, " ").slice(0, 900);
  }
  const tail = item.needsPaper
    ? " Work this out on a piece of paper, then take a photo of it. You can also type your steps."
    : " You can say your answer out loud, or type it.";
  return `${item.stem}${tail}`.replace(/\s+/g, " ").slice(0, 900);
}

/** The same words always map to the same stored clip, whoever asks. */
export const audioKey = (text: string, voice = "female", lang = "en") => createHash("sha1").update(`qa1|${voice}|${lang}|${text}`).digest("hex");

const col = () => adminDb().collection("questionAudio");

export interface Clip {
  audio: Buffer;
  mimeType: string;
  cached: boolean;
}

/**
 * A question's voice is made once and kept (Firestore, shared by everyone), so the second student, and every later
 * attempt, costs one read and no speech-synthesis call.
 */
export async function questionClip(text: string): Promise<Clip | null> {
  const key = audioKey(text);
  const snap = await col().doc(key).get();
  if (snap.exists) {
    const d = snap.data() || {};
    if (typeof d.audioBase64 === "string" && d.audioBase64) return { audio: Buffer.from(d.audioBase64, "base64"), mimeType: String(d.mimeType || "audio/mpeg"), cached: true };
  }
  const clip = await synthesizeSpeech(text, "female", undefined, { lang: "en", edgeFirst: true });
  if (!clip) return null;
  // a Firestore document holds up to 1 MB; a question read aloud is far smaller, and anything larger is simply not stored
  if (clip.audio.length < 700_000) {
    await col()
      .doc(key)
      .set({ audioBase64: clip.audio.toString("base64"), mimeType: clip.mimeType, chars: text.length, createdAt: Timestamp.now() })
      .catch(() => null);
  }
  return { audio: clip.audio, mimeType: clip.mimeType, cached: false };
}
