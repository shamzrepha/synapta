import { adminDb } from "@/lib/firebase/admin";
import type { Activity } from "./activities";
import type { StoredCard } from "./memory";
import { col } from "./store";
import type { KnowledgeUnit } from "./types";

const cardsCol = (uid: string) => adminDb().collection("users").doc(uid).collection("cards");
export const progressRef = (uid: string, worldId: string) => adminDb().collection("users").doc(uid).collection("progress").doc(worldId);
export const cardId = (kuId: string, worldId: string) => `${kuId}_${worldId}`;

/** All of a student's memory cards for one world. One equality filter: no composite index needed (R17). */
export async function loadCards(uid: string, worldId: string): Promise<Map<string, StoredCard>> {
  const snap = await cardsCol(uid).where("worldId", "==", worldId).get();
  const out = new Map<string, StoredCard>();
  snap.forEach((d) => {
    const c = d.data() as StoredCard;
    out.set(c.kuId, c);
  });
  return out;
}

export async function saveCards(uid: string, worldId: string, cards: StoredCard[]): Promise<void> {
  const batch = adminDb().batch();
  for (const c of cards) batch.set(cardsCol(uid).doc(cardId(c.kuId, worldId)), JSON.parse(JSON.stringify(c)));
  await batch.commit();
}

export interface WorldProgress {
  xp: number;
  nodes: Record<string, { done: boolean; at: string }>;
  lastActiveAt?: string;
}

export async function loadProgress(uid: string, worldId: string): Promise<WorldProgress> {
  const d = (await progressRef(uid, worldId).get()).data() as WorldProgress | undefined;
  return d ?? { xp: 0, nodes: {} };
}

/** Direct lookups of the facts (not list-and-filter): the caller names the ids. */
export async function loadUnits(worldId: string, ids: string[]): Promise<KnowledgeUnit[]> {
  const k = col.knowledge(worldId).collection("units");
  const snaps = await Promise.all(Array.from(new Set(ids)).slice(0, 200).map((id) => k.doc(id).get()));
  return snaps.filter((s) => s.exists).map((s) => s.data() as KnowledgeUnit);
}

export async function loadActivities(worldId: string, ids: string[]): Promise<Activity[]> {
  const c = col.worlds().doc(worldId).collection("activities");
  const snaps = await Promise.all(Array.from(new Set(ids)).slice(0, 300).map((id) => c.doc(id).get()));
  return snaps.filter((s) => s.exists).map((s) => s.data() as Activity);
}

/** The student may play a world she owns, or a class world she is enrolled in. */
export async function canPlay(uid: string, worldId: string): Promise<{ ok: boolean; world?: FirebaseFirestore.DocumentData }> {
  const snap = await col.worlds().doc(worldId).get();
  if (!snap.exists) return { ok: false };
  const w = snap.data()!;
  if (w.ownerUid === uid) return { ok: true, world: w };
  if (w.classId) {
    const e = await adminDb().collection("enrollments").doc(`${w.classId}_${uid}`).get();
    if (e.exists && e.data()?.status === "active") return { ok: true, world: w };
  }
  return { ok: false };
}
