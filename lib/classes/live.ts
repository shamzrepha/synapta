import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import { getAudioLesson, type AudioLessonMeta } from "@/lib/lesson/audio";
import { getStoredSimulation, simulationRef, type StoredSimulation } from "@/lib/sim/store";
import { readFlashcardBank, readQuizBank, stableId, type BankCard, type BankQuestion } from "@/lib/practice/bank";
import { PUBLISH_KEYS, type PublishKey } from "./published";

/**
 * "Push to students", like git. The teacher's own copy of a topic (lecture note, podcast, simulation,
 * flashcards and quiz) is a working draft they can keep changing. Pushing takes a snapshot, and
 * students only ever read the latest pushed snapshot, so new edits stay private until the teacher
 * pushes again. Snapshots are plain saved copies: reading one costs no AI.
 *
 * A key stored as `true` (topics from before pushing existed) reads the working copy directly.
 */
export type LiveMode = "off" | "follow" | "snapshot";

export function liveMode(kc: object | undefined | null, key: PublishKey): LiveMode {
  const raw = (kc as { contentPublished?: Record<string, unknown> } | undefined | null)?.contentPublished;
  if (!raw || typeof raw !== "object") return "follow"; // topic from before publishing existed
  const v = raw[key];
  if (v === true) return "follow";
  if (v && typeof v === "object") return "snapshot";
  return "off";
}

export function kcRefOf(classId: string, kcId: string) {
  return adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId);
}
const liveDoc = (classId: string, kcId: string, name: string) => kcRefOf(classId, kcId).collection("live").doc(name);

// ------------------------------------------------------------------ what students read

/** The lecture note a student may read ("" when nothing is pushed). */
export function lessonForStudents(kc: Record<string, unknown>): string {
  const mode = liveMode(kc, "lesson");
  if (mode === "off") return "";
  if (mode === "snapshot") return typeof kc.liveLessonMarkdown === "string" ? kc.liveLessonMarkdown : "";
  return typeof kc.lessonMarkdown === "string" ? kc.lessonMarkdown : "";
}

export async function audioForStudents(classId: string, kcId: string, kc: object): Promise<AudioLessonMeta | null> {
  const mode = liveMode(kc, "audio");
  if (mode === "off") return null;
  if (mode === "follow") return getAudioLesson(classId, kcId);
  const d = (await liveDoc(classId, kcId, "audio").get()).data();
  return d ? (d.meta as AudioLessonMeta) : null;
}

export async function simulationForStudents(classId: string, kcId: string, kc: object): Promise<StoredSimulation | null> {
  const mode = liveMode(kc, "simulation");
  if (mode === "off") return null;
  if (mode === "follow") return getStoredSimulation(classId, kcId);
  const snap = await liveDoc(classId, kcId, "simulation").get();
  return snap.exists ? (snap.data()!.sim as StoredSimulation) : null;
}

export async function quizBankForStudents(classId: string, kcId: string, kc: object): Promise<BankQuestion[]> {
  const mode = liveMode(kc, "practice");
  if (mode === "off") return [];
  if (mode === "follow") return readQuizBank(classId, kcId);
  const d = (await liveDoc(classId, kcId, "quizBank").get()).data();
  return Array.isArray(d?.questions) ? (d!.questions as BankQuestion[]) : [];
}

export async function flashcardBankForStudents(classId: string, kcId: string, kc: object): Promise<BankCard[]> {
  const mode = liveMode(kc, "practice");
  if (mode === "off") return [];
  if (mode === "follow") return readFlashcardBank(classId, kcId);
  const d = (await liveDoc(classId, kcId, "flashcardBank").get()).data();
  return Array.isArray(d?.cards) ? (d!.cards as BankCard[]) : [];
}

// ------------------------------------------------------------------ the teacher's side

interface Draft {
  exists: boolean;
  /** changes whenever the working copy changes */
  fp: string;
}

async function draftOf(classId: string, kcId: string, kc: Record<string, unknown>, key: PublishKey): Promise<Draft> {
  switch (key) {
    case "lesson": {
      const md = typeof kc.lessonMarkdown === "string" ? kc.lessonMarkdown.trim() : "";
      return { exists: md.length >= 200, fp: stableId(md) };
    }
    case "audio": {
      const a = await getAudioLesson(classId, kcId);
      return { exists: a?.status === "ready" && a.turns.length > 0, fp: `v${a?.version || 0}` };
    }
    case "simulation": {
      const sim = await getStoredSimulation(classId, kcId);
      return { exists: !!sim?.html && sim.status === "ready", fp: `v${sim?.version || 0}-${stableId(sim?.html || "")}` };
    }
    case "practice": {
      const [q, c] = await Promise.all([readQuizBank(classId, kcId), readFlashcardBank(classId, kcId)]);
      return { exists: q.length > 0 || c.length > 0, fp: `${q.length}-${c.length}-${stableId(q.map((x) => x.id).join())}-${stableId(c.map((x) => x.id).join())}` };
    }
  }
}

export interface KeyStatus {
  key: PublishKey;
  /** is anything created yet */
  hasDraft: boolean;
  mode: LiveMode;
  /** the working copy differs from what students have */
  changed: boolean;
  pushedAt: string | null;
}

export async function liveStatus(classId: string, kcId: string, kc: Record<string, unknown>): Promise<KeyStatus[]> {
  const raw = (kc.contentPublished || {}) as Record<string, { fp?: string; at?: { toDate?: () => Date } } | boolean | undefined>;
  return Promise.all(
    PUBLISH_KEYS.map(async (key) => {
      const [d, mode] = [await draftOf(classId, kcId, kc, key), liveMode(kc, key)];
      const v = raw[key];
      const snap = v && typeof v === "object" ? v : null;
      return {
        key,
        hasDraft: d.exists,
        mode,
        changed: mode === "snapshot" ? snap?.fp !== d.fp : mode === "follow" ? false : false,
        pushedAt: snap?.at?.toDate?.().toISOString() ?? null,
      };
    })
  );
}

/** Takes a snapshot of the working copy of each key and makes it what students see. */
export async function pushToStudents(classId: string, kcId: string, keys: PublishKey[]): Promise<Record<string, unknown>> {
  const ref = kcRefOf(classId, kcId);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Topic not found");
  const kc = snap.data()!;
  const update: Record<string, unknown> = {};
  const next: Record<string, unknown> = { ...((kc.contentPublished as Record<string, unknown>) || {}) };

  for (const key of keys) {
    const d = await draftOf(classId, kcId, kc, key);
    if (!d.exists) throw new ApiError(400, "NOTHING_TO_PUSH", `There's no ${key === "practice" ? "flashcards or quiz" : key === "audio" ? "podcast" : key === "lesson" ? "lecture note" : "simulation"} to push yet — create it first.`);
    const at = Timestamp.now();
    if (key === "lesson") {
      update.liveLessonMarkdown = kc.lessonMarkdown;
    } else if (key === "audio") {
      const meta = (await getAudioLesson(classId, kcId))!;
      if (meta.turns.some((t) => !t.hasAudio)) throw new ApiError(400, "AUDIO_INCOMPLETE", "Some lines of the podcast aren't recorded yet. Record the missing clips first, so students never hear the robot voice.");
      await liveDoc(classId, kcId, "audio").set({ meta, version: meta.version, at });
    } else if (key === "simulation") {
      const sim = (await simulationRef(classId, kcId).get()).data();
      await liveDoc(classId, kcId, "simulation").set({ sim, at });
    } else {
      const [q, c] = await Promise.all([readQuizBank(classId, kcId), readFlashcardBank(classId, kcId)]);
      await Promise.all([liveDoc(classId, kcId, "quizBank").set({ questions: q, at }), liveDoc(classId, kcId, "flashcardBank").set({ cards: c, at })]);
    }
    next[key] = { fp: d.fp, at };
  }
  update.contentPublished = next;
  update.updatedAt = Timestamp.now();
  await ref.update(update);
  return next;
}

/** Takes content offline for students. The snapshot is kept, so pushing again is instant. */
export async function takeOffline(classId: string, kcId: string, keys: PublishKey[]) {
  const ref = kcRefOf(classId, kcId);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Topic not found");
  const next: Record<string, unknown> = { ...((snap.data()!.contentPublished as Record<string, unknown>) || {}) };
  // an untouched older topic reads "follow" for every key; make that explicit before changing one
  for (const k of PUBLISH_KEYS) if (next[k] === undefined) next[k] = snap.data()!.contentPublished ? false : true;
  for (const key of keys) next[key] = false;
  await ref.update({ contentPublished: next, updatedAt: Timestamp.now() });
  return next;
}
