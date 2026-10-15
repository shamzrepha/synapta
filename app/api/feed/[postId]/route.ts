import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { loadVisiblePost } from "@/lib/social/access";
import { bumpChannels } from "@/lib/live/server";
import { feedChannels } from "@/lib/social/feed";

export const runtime = "nodejs";

/** Authors, class teachers and admins can delete a post (and its likes/comments). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const { postId } = await params;
    const caller = await requireUser(req);
    const { ref, post, canModerate } = await loadVisiblePost(caller, postId);
    if (!canModerate) throw new ApiError(403, "FORBIDDEN", "You can't delete this post.");
    await adminDb().recursiveDelete(ref);
    await bumpChannels([...feedChannels(post.classId, post.visibility), `post:${postId}`]);
    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
