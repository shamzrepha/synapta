import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import { bumpChannel } from "@/lib/live/server";

/**
 * Saved Study Hub notebooks. A notebook belongs to a course label, holds up to 20 sources, keeps its
 * AI chat history and studio outputs, and can be shared with friends as viewer/editor. Sharing
 * creates a linked group chat (the notebook's "room"), reusing Messages instead of a second chat system.
 */

export const LIMITS = {
  perCourse: 10,
  total: 50,
  sources: 20,
  sourceChars: 300_000,
  members: 30,
};

export type NotebookRole = "owner" | "editor" | "viewer";

export function notebookRef(id: string) {
  return adminDb().collection("notebooks").doc(id);
}

export async function loadNotebook(id: string, uid: string, need: NotebookRole = "viewer") {
  const snap = await notebookRef(id).get();
  if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Notebook not found");
  const nb = snap.data()!;
  const role = (nb.roles?.[uid] as NotebookRole | undefined) || null;
  if (!role) throw new ApiError(403, "FORBIDDEN", "You don't have access to this notebook.");
  const rank = { viewer: 0, editor: 1, owner: 2 } as const;
  if (rank[role] < rank[need]) throw new ApiError(403, "FORBIDDEN", need === "owner" ? "Only the owner can do that." : "You have view-only access to this notebook.");
  return { ref: snap.ref, nb, role };
}

export async function createNotebook(uid: string, title: string, course: string): Promise<string> {
  const mine = await adminDb().collection("notebooks").where("ownerUid", "==", uid).get();
  if (mine.size >= LIMITS.total) throw new ApiError(409, "LIMIT", `You can have up to ${LIMITS.total} notebooks. Delete one to make room.`);
  const inCourse = mine.docs.filter((d) => (d.data().course || "").toLowerCase() === course.toLowerCase()).length;
  if (inCourse >= LIMITS.perCourse) throw new ApiError(409, "LIMIT", `Up to ${LIMITS.perCourse} notebooks per course.`);
  const ref = adminDb().collection("notebooks").doc();
  await ref.set({
    id: ref.id,
    title: title.trim().slice(0, 80),
    course: course.trim().slice(0, 60) || "General",
    ownerUid: uid,
    memberIds: [uid],
    roles: { [uid]: "owner" },
    sourceCount: 0,
    chatId: null,
    studio: {},
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  return ref.id;
}

export async function touch(id: string, extra: Record<string, unknown> = {}) {
  await notebookRef(id).update({ ...extra, updatedAt: Timestamp.now() });
  await bumpChannel(`notebook:${id}`);
}

export async function addSource(id: string, uid: string, src: { title: string; type: "pdf" | "note"; content: string }) {
  const { ref, nb } = await loadNotebook(id, uid, "editor");
  if ((nb.sourceCount || 0) >= LIMITS.sources) throw new ApiError(409, "LIMIT", `A notebook can hold up to ${LIMITS.sources} sources.`);
  const content = src.content.slice(0, LIMITS.sourceChars);
  const sRef = ref.collection("sources").doc();
  await sRef.set({
    title: src.title.slice(0, 120),
    type: src.type,
    content,
    wordCount: content.split(/\s+/).filter(Boolean).length,
    truncated: src.content.length > LIMITS.sourceChars,
    addedBy: uid,
    createdAt: Timestamp.now(),
  });
  await touch(id, { sourceCount: FieldValue.increment(1) });
  return sRef.id;
}
