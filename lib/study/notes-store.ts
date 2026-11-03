import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import { MAX_VERSIONS } from "./notes";

const COL = "studyNotes";

export const noteRef = (id: string) => adminDb().collection(COL).doc(id);
export const notesCol = () => adminDb().collection(COL);

export async function loadOwnNote(id: string, uid: string) {
  const snap = await noteRef(id).get();
  if (!snap.exists || snap.data()?.uid !== uid) throw new ApiError(404, "NOT_FOUND", "Notes not found");
  return { ref: snap.ref, data: snap.data()! };
}

export interface NoteVersion {
  n: number;
  markdown: string;
  instruction: string;
  createdAt: string;
}

/** Saves a new version (keeping the newest MAX_VERSIONS) and returns its number. */
export async function addVersion(id: string, markdown: string, instruction: string): Promise<number> {
  const ref = noteRef(id);
  const versions = ref.collection("versions");
  const n = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = (Number(snap.data()?.head) || 0) + 1;
    tx.set(versions.doc(String(next)), { n: next, markdown, instruction: instruction.slice(0, 300), createdAt: new Date().toISOString() });
    tx.update(ref, { head: next, updatedAt: Timestamp.now() });
    return next;
  });
  if (n > MAX_VERSIONS) {
    const old = await versions.where("n", "<=", n - MAX_VERSIONS).get();
    await Promise.all(old.docs.map((d) => d.ref.delete()));
  }
  return n;
}

export async function readVersions(id: string): Promise<NoteVersion[]> {
  const snap = await noteRef(id).collection("versions").orderBy("n", "desc").limit(MAX_VERSIONS).get();
  return snap.docs.map((d) => d.data() as NoteVersion);
}
