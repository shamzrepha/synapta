import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { parseJson, ApiError } from "@/lib/api/errors";
import { FieldValue } from "@/lib/firebase/admin";
import { loadVisiblePost } from "@/lib/social/access";
import { createPost } from "@/lib/social/feed";
import { notify } from "@/lib/notifications/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  text: z.string().trim().max(2000).optional().default(""),
  classId: z.string().optional().nullable(),
});

/** Repost (empty text) or quote (with text) a post to everyone or into a class feed. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const { postId } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "feed_repost", limit: 10, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, schema);
    const { ref, post } = await loadVisiblePost(caller, postId);
    // Reposting a repost shares the original
    const original = post.kind === "repost" && post.repostOf ? post.repostOf : null;
    if (post.visibility === "class" && !body.classId) {
      throw new ApiError(400, "CLASS_ONLY", "Class-only posts can only be shared inside their class.");
    }
    if (body.classId) {
      const access = await assertClassAccess(caller, body.classId, "view");
      if (!access.canMutate && !access.isEnrolled) throw new ApiError(403, "FORBIDDEN", "Join this class to share into it.");
    }
    const snapshot = original || {
      id: postId,
      authorUid: post.authorUid,
      authorName: post.authorName,
      authorPhoto: post.authorPhoto || null,
      kind: post.kind,
      text: String(post.text || "").slice(0, 1500),
      images: Array.isArray(post.images) ? post.images.slice(0, 1) : [],
      createdAt: post.createdAt?.toDate?.().toISOString() || null,
    };
    const id = await createPost({
      authorUid: caller.uid,
      text: body.text ?? "",
      kind: "repost",
      classId: body.classId || null,
      visibility: body.classId ? "class" : "public",
      repostOf: snapshot,
    });
    await ref.update({ repostCount: FieldValue.increment(1) }).catch(() => null);
    if (snapshot.authorUid !== caller.uid) {
      await notify(snapshot.authorUid, {
        type: "like",
        title: body.text ? "Someone quoted your post" : "Someone reposted your post",
        body: String(snapshot.text).slice(0, 80),
        href: `/feed?post=${id}`,
        icon: "🔁",
        actorUid: caller.uid,
      });
    }
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
