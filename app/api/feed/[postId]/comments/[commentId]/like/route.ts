import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { loadVisiblePost } from "@/lib/social/access";
import { bumpChannels } from "@/lib/live/server";
import { notify } from "@/lib/notifications/server";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

/** Toggles the caller's like on a comment. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ postId: string; commentId: string }> }) {
  try {
    const { postId, commentId } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "comment_like", limit: 90, windowMs: 60_000 });
    if (limited) return limited;
    const { ref } = await loadVisiblePost(caller, postId);
    const cRef = ref.collection("comments").doc(commentId);
    const likeRef = cRef.collection("likes").doc(caller.uid);
    const r = await adminDb().runTransaction(async (t) => {
      const [c, like] = await Promise.all([t.get(cRef), t.get(likeRef)]);
      if (!c.exists) throw new ApiError(404, "NOT_FOUND", "Comment not found");
      const count = c.data()!.likeCount || 0;
      if (like.exists) {
        t.delete(likeRef);
        t.update(cRef, { likeCount: FieldValue.increment(-1) });
        return { liked: false, likeCount: Math.max(0, count - 1), author: c.data()!.authorUid as string, text: c.data()!.text as string };
      }
      t.set(likeRef, { uid: caller.uid, createdAt: Timestamp.now() });
      t.update(cRef, { likeCount: FieldValue.increment(1) });
      return { liked: true, likeCount: count + 1, author: c.data()!.authorUid as string, text: c.data()!.text as string };
    });
    await bumpChannels([`post:${postId}`]);
    if (r.liked && r.author !== caller.uid) {
      const me = await adminDb().collection("users").doc(caller.uid).get();
      await notify(r.author, { type: "like", title: `${me.data()?.displayName || "Someone"} liked your comment`, body: r.text.slice(0, 80), href: `/feed?post=${postId}`, icon: "❤️", actorUid: caller.uid });
    }
    return NextResponse.json({ ok: true, data: { liked: r.liked, likeCount: r.likeCount } });
  } catch (error) {
    return handleAuthError(error);
  }
}
