import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import { loadVisiblePost } from "@/lib/social/access";
import { setReaction } from "@/lib/social/reactions";

export const runtime = "nodejs";

/** Back-compat toggle: like if no reaction, otherwise remove the reaction. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const { postId } = await params;
    const caller = await requireUser(req);
    const { ref, post } = await loadVisiblePost(caller, postId);
    const existing = await adminDb().collection("posts").doc(postId).collection("reactions").doc(caller.uid).get();
    const r = await setReaction({ postRef: ref, post, uid: caller.uid, reaction: existing.exists ? null : "like" });
    return NextResponse.json({ ok: true, data: { liked: !!r.myReaction, likeCount: r.likeCount } });
  } catch (error) {
    return handleAuthError(error);
  }
}
