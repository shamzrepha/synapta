import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { loadVisiblePost } from "@/lib/social/access";
import { bumpChannels } from "@/lib/live/server";
import { notify } from "@/lib/notifications/server";
import { trackProgress } from "@/lib/game/progress";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

/** Toggles the caller's like. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const { postId } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "feed_like", limit: 60, windowMs: 60_000 });
    if (limited) return limited;
    const { ref, post } = await loadVisiblePost(caller, postId);
    const likeRef = ref.collection("likes").doc(caller.uid);

    const result = await adminDb().runTransaction(async (t) => {
      const [like, cur] = await Promise.all([t.get(likeRef), t.get(ref)]);
      const count = cur.data()?.likeCount || 0;
      if (like.exists) {
        t.delete(likeRef);
        t.update(ref, { likeCount: FieldValue.increment(-1) });
        return { liked: false, likeCount: Math.max(0, count - 1) };
      }
      t.set(likeRef, { uid: caller.uid, createdAt: Timestamp.now() });
      t.update(ref, { likeCount: FieldValue.increment(1) });
      return { liked: true, likeCount: count + 1 };
    });

    await bumpChannels([`post:${postId}`]);
    if (result.liked && post.authorUid !== caller.uid) {
      const me = await adminDb().collection("users").doc(caller.uid).get();
      await notify(post.authorUid, {
        type: "like",
        title: `${me.data()?.displayName || "Someone"} liked your post`,
        body: String(post.text || "").slice(0, 80),
        href: `/feed?post=${postId}`,
        icon: "❤️",
        actorUid: caller.uid,
      });
      await trackProgress({ uid: post.authorUid, stats: { likesReceived: 1 }, countsForQuests: false });
    }
    return NextResponse.json({ ok: true, data: { liked: result.liked, likeCount: result.likeCount } });
  } catch (error) {
    return handleAuthError(error);
  }
}
