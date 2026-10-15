import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { adminDb, FieldValue } from "@/lib/firebase/admin";
import { loadVisiblePost } from "@/lib/social/access";
import { bumpChannels } from "@/lib/live/server";

export const runtime = "nodejs";

/** Comment author, post moderators (author / class teacher / admin) can delete a comment and its replies. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ postId: string; commentId: string }> }) {
  try {
    const { postId, commentId } = await params;
    const caller = await requireUser(req);
    const { ref, canModerate } = await loadVisiblePost(caller, postId);
    const cRef = ref.collection("comments").doc(commentId);
    const c = await cRef.get();
    if (!c.exists) return NextResponse.json({ ok: true, data: { deleted: true } });
    if (c.data()!.authorUid !== caller.uid && !canModerate) throw new ApiError(403, "FORBIDDEN", "You can't delete this comment.");
    const replies = c.data()!.parentId ? [] : (await ref.collection("comments").where("parentId", "==", commentId).get()).docs;
    for (const r of replies) await adminDb().recursiveDelete(r.ref);
    await adminDb().recursiveDelete(cRef);
    await ref.update({ commentCount: FieldValue.increment(-(1 + replies.length)) });
    if (c.data()!.parentId) await ref.collection("comments").doc(c.data()!.parentId).update({ replyCount: FieldValue.increment(-1) }).catch(() => null);
    await bumpChannels([`post:${postId}`]);
    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
