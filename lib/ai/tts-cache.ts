import { createHash } from "crypto";
import { adminDb, Timestamp } from "@/lib/firebase/admin";

/**
 * Shared voice cache. A spoken line is stored once (keyed by host slot + text) and reused by every
 * learner who plays the same script, so a podcast is only ever synthesised once. Clips larger than
 * one Firestore document are split across `parts` documents.
 */
const INLINE_MAX = 700_000; // base64 characters that fit in one document
const MAX_BYTES = 6_000_000;

export function ttsKey(slot: string, text: string): string {
  return createHash("sha1").update(`${slot}|${text.trim()}`).digest("hex");
}

export interface CachedVoice {
  bytes: Buffer;
  mimeType: string;
  voiceName: string;
}

export async function getCachedVoice(key: string): Promise<CachedVoice | null> {
  try {
    const ref = adminDb().collection("ttsCache").doc(key);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const d = snap.data()!;
    let b64 = typeof d.data === "string" ? d.data : "";
    if (!b64 && d.parts > 0) {
      const parts = await ref.collection("p").get();
      b64 = parts.docs
        .sort((a, b) => Number(a.id) - Number(b.id))
        .map((p) => String(p.data().data || ""))
        .join("");
    }
    if (!b64) return null;
    return { bytes: Buffer.from(b64, "base64"), mimeType: String(d.mimeType || "audio/mpeg"), voiceName: String(d.voiceName || "") };
  } catch {
    return null;
  }
}

export async function putCachedVoice(key: string, voice: CachedVoice): Promise<void> {
  if (voice.bytes.length > MAX_BYTES) return;
  try {
    const ref = adminDb().collection("ttsCache").doc(key);
    const b64 = voice.bytes.toString("base64");
    const meta = { mimeType: voice.mimeType, voiceName: voice.voiceName, bytes: voice.bytes.length, createdAt: Timestamp.now() };
    if (b64.length <= INLINE_MAX) {
      await ref.set({ ...meta, data: b64, parts: 0 });
      return;
    }
    const chunks: string[] = [];
    for (let i = 0; i < b64.length; i += INLINE_MAX) chunks.push(b64.slice(i, i + INLINE_MAX));
    const batch = adminDb().batch();
    chunks.forEach((c, i) => batch.set(ref.collection("p").doc(String(i)), { data: c }));
    batch.set(ref, { ...meta, parts: chunks.length });
    await batch.commit();
  } catch {
    // caching is an optimisation; never fail playback because of it
  }
}
