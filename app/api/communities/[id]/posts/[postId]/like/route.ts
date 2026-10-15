import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { communityRef, requireMember } from "@/lib/communities/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; postId: string }> }) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "community_like", limit: 60, windowMs: 60_000 });
    if (limited) return limited;
    const { id, postId } = await params;
    await requireMember(id, caller.uid);
    const ref = communityRef(id).collection("posts").doc(postId);
    const likeRef = ref.collection("likes").doc(caller.uid);
    const result = await adminDb().runTransaction(async (t) => {
      const [post, like] = await Promise.all([t.get(ref), t.get(likeRef)]);
      if (!post.exists) throw new ApiError(404, "NOT_FOUND", "Post not found.");
      const count = Number(post.data()!.likeCount) || 0;
      if (like.exists) {
        t.delete(likeRef);
        t.update(ref, { likeCount: FieldValue.increment(-1) });
        return { liked: false, likeCount: Math.max(0, count - 1) };
      }
      t.set(likeRef, { uid: caller.uid, createdAt: Timestamp.now() });
      t.update(ref, { likeCount: FieldValue.increment(1) });
      return { liked: true, likeCount: count + 1 };
    });
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return handleAuthError(error);
  }
}
