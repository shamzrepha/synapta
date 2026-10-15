import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import { bumpChannel } from "@/lib/live/server";
import { getClassAccess } from "@/lib/auth/classAccess";
import type { AuthUser } from "@/lib/auth/requireUser";
import { diffSpecs } from "./diff";
import { parseSpec, type DesignSpec } from "./spec";

/**
 * Maker Studio storage, Git-style:
 *   designs/{id}                 head spec + metadata (owner, collaborators, counts)
 *   designs/{id}/commits/{cid}   every version with author, message, source and a diff summary
 *   designs/{id}/stars/{uid}
 * Commits are optimistic: a commit names the head it was based on, and a stale base is rejected
 * (409) so two people editing at once never silently overwrite each other.
 */

export type Visibility = "private" | "public" | "class";
export type CommitSource = "create" | "template" | "manual" | "ai" | "param" | "revert" | "fork";

export const MAX_DESIGNS_PER_USER = 100;

export function designRef(id: string) {
  return adminDb().collection("designs").doc(id);
}

export interface DesignAccess {
  ref: FirebaseFirestore.DocumentReference;
  data: FirebaseFirestore.DocumentData;
  canEdit: boolean;
  isOwner: boolean;
}

export async function loadDesign(id: string, user: AuthUser, need: "view" | "edit" | "owner" = "view"): Promise<DesignAccess> {
  const ref = designRef(id);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Design not found");
  const data = snap.data()!;
  const isOwner = data.ownerUid === user.uid || user.role === "admin";
  const isCollab = Array.isArray(data.memberIds) && data.memberIds.includes(user.uid);
  let canView = isOwner || isCollab || data.visibility === "public";
  if (!canView && data.visibility === "class" && data.classId) {
    canView = (await getClassAccess(user, data.classId).catch(() => null))?.canView ?? false;
  }
  if (!canView) throw new ApiError(403, "FORBIDDEN", "This design is private.");
  const canEdit = isOwner || isCollab;
  if (need === "edit" && !canEdit) throw new ApiError(403, "FORBIDDEN", "Only the owner and collaborators can change this design. Fork it to make your own copy.");
  if (need === "owner" && !isOwner) throw new ApiError(403, "FORBIDDEN", "Only the owner can do that.");
  return { ref, data, canEdit, isOwner };
}

async function displayName(uid: string): Promise<string> {
  const u = await adminDb().collection("users").doc(uid).get();
  return String(u.data()?.displayName || u.data()?.username || "Maker");
}

export async function createDesign(params: {
  user: AuthUser;
  title: string;
  spec: DesignSpec;
  source: CommitSource;
  message: string;
  visibility?: Visibility;
  classId?: string | null;
  kcId?: string | null;
  templateId?: string | null;
  forkedFrom?: { id: string; title: string; ownerName: string; commitId: string } | null;
  challengeId?: string | null;
}): Promise<string> {
  const db = adminDb();
  const mine = await db.collection("designs").where("ownerUid", "==", params.user.uid).count().get().catch(() => null);
  if (mine && mine.data().count >= MAX_DESIGNS_PER_USER) throw new ApiError(409, "LIMIT", `You can keep up to ${MAX_DESIGNS_PER_USER} designs. Delete one to make room.`);
  const name = await displayName(params.user.uid);
  const ref = db.collection("designs").doc();
  const commitRef = ref.collection("commits").doc();
  const now = Timestamp.now();
  const spec = parseSpec(params.spec);
  const batch = db.batch();
  batch.set(ref, {
    id: ref.id,
    title: params.title.trim().slice(0, 80) || "Untitled design",
    kind: spec.kind,
    summary: spec.summary.slice(0, 300),
    ownerUid: params.user.uid,
    ownerName: name,
    memberIds: [params.user.uid],
    visibility: params.visibility || "private",
    classId: params.classId || null,
    kcId: params.kcId || null,
    templateId: params.templateId || null,
    challengeId: params.challengeId || null,
    forkedFrom: params.forkedFrom || null,
    spec,
    headCommitId: commitRef.id,
    commitCount: 1,
    forkCount: 0,
    starCount: 0,
    contributors: { [params.user.uid]: 1 },
    contributorNames: { [params.user.uid]: name },
    progress: {},
    createdAt: now,
    updatedAt: now,
  });
  batch.set(commitRef, {
    id: commitRef.id,
    parentId: null,
    authorUid: params.user.uid,
    authorName: name,
    message: params.message.slice(0, 200),
    source: params.source,
    diff: diffSpecs(null, spec),
    spec,
    createdAt: now,
  });
  await batch.commit();
  return ref.id;
}

/** Appends a version. `parentId` must be the current head, otherwise 409 with the new head. */
export async function commitDesign(params: {
  id: string;
  user: AuthUser;
  spec: DesignSpec;
  parentId: string;
  message: string;
  source: CommitSource;
}): Promise<{ commitId: string; diff: ReturnType<typeof diffSpecs> }> {
  const { ref } = await loadDesign(params.id, params.user, "edit");
  const name = await displayName(params.user.uid);
  const spec = parseSpec(params.spec);
  const result = await adminDb().runTransaction(async (t) => {
    const snap = await t.get(ref);
    const d = snap.data()!;
    if (d.headCommitId !== params.parentId) {
      throw new ApiError(409, "STALE", "Someone else saved a newer version. Reload to see it, then apply your change again.", undefined);
    }
    const diff = diffSpecs(d.spec ? parseSpec(d.spec) : null, spec);
    if (diff.lines.length === 1 && diff.lines[0] === "No changes") return { commitId: d.headCommitId as string, diff };
    const commitRef = ref.collection("commits").doc();
    const now = Timestamp.now();
    t.set(commitRef, {
      id: commitRef.id,
      parentId: params.parentId,
      authorUid: params.user.uid,
      authorName: name,
      message: params.message.slice(0, 200) || diff.lines[0],
      source: params.source,
      diff: { ...diff, lines: diff.lines.slice(0, 40) },
      spec,
      createdAt: now,
    });
    t.update(ref, {
      spec,
      kind: spec.kind,
      summary: spec.summary.slice(0, 300),
      headCommitId: commitRef.id,
      commitCount: FieldValue.increment(1),
      [`contributors.${params.user.uid}`]: FieldValue.increment(1),
      [`contributorNames.${params.user.uid}`]: name,
      updatedAt: now,
    });
    return { commitId: commitRef.id, diff };
  });
  await bumpChannel(`design:${params.id}`);
  return result;
}

export function serializeDesign(id: string, d: FirebaseFirestore.DocumentData) {
  const iso = (v: unknown) => ((v as { toDate?: () => Date })?.toDate ? (v as { toDate: () => Date }).toDate().toISOString() : null);
  return {
    id,
    title: d.title,
    kind: d.kind,
    summary: d.summary || "",
    ownerUid: d.ownerUid,
    ownerName: d.ownerName,
    visibility: d.visibility,
    classId: d.classId || null,
    kcId: d.kcId || null,
    templateId: d.templateId || null,
    challengeId: d.challengeId || null,
    forkedFrom: d.forkedFrom || null,
    headCommitId: d.headCommitId,
    commitCount: d.commitCount || 1,
    forkCount: d.forkCount || 0,
    starCount: d.starCount || 0,
    contributors: Object.entries((d.contributors || {}) as Record<string, number>)
      .map(([uid, commits]) => ({ uid, commits, name: (d.contributorNames || {})[uid] || "Maker" }))
      .sort((a, b) => b.commits - a.commits),
    memberIds: d.memberIds || [],
    progress: d.progress || {},
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  };
}
