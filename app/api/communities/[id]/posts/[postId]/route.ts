import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { canDeletePost } from "@/lib/communities/rules";
import { communityRef, requireMember } from "@/lib/communities/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; postId: string }> };

async function deleteSub(ref: FirebaseFirestore.DocumentReference, name: string) {
  const snap = await ref.collection(name).limit(400).get();
  if (snap.empty) return;
  const batch = adminDb().batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

/** Author or community owner deletes a post. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const caller = await requireUser(req);
    const { id, postId } = await params;
    const role = await requireMember(id, caller.uid);
    const ref = communityRef(id).collection("posts").doc(postId);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Post not found.");
    if (!canDeletePost(role, snap.data()!.authorUid, caller.uid)) throw new ApiError(403, "FORBIDDEN", "You can't delete this post.");
    await deleteSub(ref, "likes");
    await deleteSub(ref, "comments");
    await ref.delete();
    return NextResponse.json({ ok: true, data: { id: postId } });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Owner pins/unpins an announcement. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const caller = await requireUser(req);
    const { id, postId } = await params;
    const { pinned } = await parseJson(req, z.object({ pinned: z.boolean() }));
    if ((await requireMember(id, caller.uid)) !== "owner") throw new ApiError(403, "FORBIDDEN", "Only the owner can pin posts.");
    const ref = communityRef(id).collection("posts").doc(postId);
    if (!(await ref.get()).exists) throw new ApiError(404, "NOT_FOUND", "Post not found.");
    await ref.update({ pinned });
    return NextResponse.json({ ok: true, data: { id: postId, pinned } });
  } catch (error) {
    return handleAuthError(error);
  }
}
