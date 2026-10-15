import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { loadVisiblePost } from "@/lib/social/access";

export const runtime = "nodejs";

/** Toggles a post in the caller's saved items. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const { postId } = await params;
    const caller = await requireUser(req);
    const { post } = await loadVisiblePost(caller, postId);
    const ref = adminDb().collection("users").doc(caller.uid).collection("bookmarks").doc(`post_${postId}`);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.delete();
      return NextResponse.json({ ok: true, data: { bookmarked: false } });
    }
    await ref.set({
      kind: "post",
      refId: postId,
      title: String(post.text || post.repostOf?.text || "Post").slice(0, 140),
      subtitle: post.authorName || "",
      href: `/feed?post=${postId}`,
      createdAt: Timestamp.now(),
    });
    return NextResponse.json({ ok: true, data: { bookmarked: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
