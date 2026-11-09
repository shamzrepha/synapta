import { adminDb, Timestamp } from "@/lib/firebase/admin";
import type { CleanLine } from "./clean";
import { emptyLibrary, type Concept, type Conflict, type KnowledgeUnit, type Library, type Relation } from "./types";

type Db = FirebaseFirestore.Firestore;
const db = (): Db => adminDb();

export const col = {
  sourceDocs: () => db().collection("sourceDocs"),
  worlds: () => db().collection("worlds"),
  jobs: () => db().collection("jobs"),
  knowledge: (worldId: string) => db().collection("knowledge").doc(worldId),
};

export interface SourceDocMeta {
  ownerUid: string;
  classId?: string | null;
  title: string;
  kind: "docx" | "pdf" | "image" | "text";
  status: "uploaded" | "cleaned" | "reviewed";
  pageCount: number;
  flaggedCount: number;
  repairCount: number;
  createdAt: FirebaseFirestore.Timestamp;
}

export interface WorldDoc {
  ownerUid: string;
  classId?: string | null;
  title: string;
  subjectPackId: string;
  themeId: string;
  docIds: string[];
  status: "empty" | "building" | "ready";
  stats: { kuCount: number; conceptCount: number; activityCount: number; conflictCount: number; docCount: number };
  version: number;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

/** Writes in chunks of 400 (the Firestore batch limit is 500). */
export async function commitInChunks(ops: Array<(b: FirebaseFirestore.WriteBatch) => void>): Promise<void> {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db().batch();
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
}

export async function saveDocPages(docId: string, pages: Array<{ pageNo: number; lines: CleanLine[] }>): Promise<void> {
  await commitInChunks(pages.map((p) => (b) => b.set(col.sourceDocs().doc(docId).collection("pages").doc(String(p.pageNo)), { pageNo: p.pageNo, lines: p.lines })));
}

export async function loadDocPages(docId: string): Promise<Array<{ pageNo: number; lines: CleanLine[] }>> {
  const snap = await col.sourceDocs().doc(docId).collection("pages").get();
  return snap.docs.map((d) => d.data() as { pageNo: number; lines: CleanLine[] }).sort((a, b) => a.pageNo - b.pageNo);
}

/** The whole library of a world, read from its subcollections. */
export async function loadLibrary(worldId: string): Promise<Library> {
  const k = col.knowledge(worldId);
  const [units, concepts, conflicts, rel] = await Promise.all([k.collection("units").get(), k.collection("concepts").get(), k.collection("conflicts").get(), k.collection("meta").doc("relations").get()]);
  const lib = emptyLibrary();
  units.forEach((d) => (lib.units[d.id] = d.data() as KnowledgeUnit));
  concepts.forEach((d) => (lib.concepts[d.id] = d.data() as Concept));
  conflicts.forEach((d) => (lib.conflicts[d.id] = d.data() as Conflict));
  lib.relations = ((rel.data()?.items as Relation[] | undefined) ?? []) as Relation[];
  lib.docIds = ((await col.worlds().doc(worldId).get()).data()?.docIds as string[] | undefined) ?? [];
  return lib;
}

/** Saves the library. Ids are stable, so running it twice writes the same documents (idempotent, R16). */
export async function saveLibrary(worldId: string, lib: Library): Promise<void> {
  const k = col.knowledge(worldId);
  const ops: Array<(b: FirebaseFirestore.WriteBatch) => void> = [];
  for (const u of Object.values(lib.units)) ops.push((b) => b.set(k.collection("units").doc(u.id), JSON.parse(JSON.stringify(u))));
  for (const c of Object.values(lib.concepts)) ops.push((b) => b.set(k.collection("concepts").doc(c.id), JSON.parse(JSON.stringify(c))));
  for (const c of Object.values(lib.conflicts)) ops.push((b) => b.set(k.collection("conflicts").doc(c.id), JSON.parse(JSON.stringify(c))));
  ops.push((b) => b.set(k.collection("meta").doc("relations"), { items: lib.relations }));
  await commitInChunks(ops);
}

export async function deleteCollectionDocs(ref: FirebaseFirestore.CollectionReference): Promise<void> {
  const snap = await ref.get();
  await commitInChunks(snap.docs.map((d) => (b) => b.delete(d.ref)));
}

/** Removes a world and everything derived from it (R8). Source documents are only removed when asked. */
export async function deleteWorldData(worldId: string): Promise<void> {
  const k = col.knowledge(worldId);
  for (const sub of ["units", "concepts", "conflicts", "meta"]) await deleteCollectionDocs(k.collection(sub));
  for (const sub of ["nodes", "activities", "mergeLog"]) await deleteCollectionDocs(col.worlds().doc(worldId).collection(sub));
  await k.delete().catch(() => null);
  await col.worlds().doc(worldId).delete();
}

export async function deleteSourceDoc(docId: string): Promise<void> {
  await deleteCollectionDocs(col.sourceDocs().doc(docId).collection("pages"));
  await col.sourceDocs().doc(docId).delete();
}

export const now = () => Timestamp.now();
