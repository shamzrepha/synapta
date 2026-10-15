import { adminDb } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import { getClassAccess } from "@/lib/auth/classAccess";
import type { AuthUser } from "@/lib/auth/requireUser";

/** Loads a post and checks the caller may see it (class posts need class access). */
export async function loadVisiblePost(caller: AuthUser, postId: string) {
  const ref = adminDb().collection("posts").doc(postId);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Post not found");
  const post = snap.data()!;
  let canModerate = caller.role === "admin" || post.authorUid === caller.uid;
  if (post.classId) {
    const access = await getClassAccess(caller, post.classId);
    if (post.visibility === "class" && !access.canView) {
      throw new ApiError(403, "FORBIDDEN", "This post is only visible to its class.");
    }
    canModerate = canModerate || access.canMutate;
  }
  return { ref, post, canModerate };
}
