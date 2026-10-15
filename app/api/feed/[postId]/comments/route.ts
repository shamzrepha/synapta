import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson, ApiError } from "@/lib/api/errors";
import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { loadVisiblePost } from "@/lib/social/access";
import { bumpChannels } from "@/lib/live/server";
import { notify, notifyMany } from "@/lib/notifications/server";
import { getPublicProfiles } from "@/lib/social/profile";
import { extractMentions } from "@/lib/social/text";
import { resolveMentions } from "@/lib/social/feed";
import { trackProgress } from "@/lib/game/progress";
import { checkRateLimit } from "@/lib/rateLimit";
import { z } from "zod";

export const runtime = "nodejs";

/** Comments with one level of threaded replies, like counts and the caller's likes. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const { postId } = await params;
    const caller = await requireUser(req);
    const { ref, canModerate } = await loadVisiblePost(caller, postId);
    const snap = await ref.collection("comments").orderBy("createdAt", "asc").limit(300).get();
    const likeRefs = snap.docs.map((d) => d.ref.collection("likes").doc(caller.uid));
    const likes = likeRefs.length ? await adminDb().getAll(...likeRefs) : [];
    const liked = new Set(likes.filter((s) => s.exists).map((s) => s.ref.parent.parent!.id));

    const all = snap.docs.map((d) => {
      const c = d.data();
      return {
        id: d.id,
        parentId: (c.parentId as string) || null,
        replyToName: (c.replyToName as string) || null,
        authorUid: c.authorUid,
        authorName: c.authorName,
        authorUsername: c.authorUsername || null,
        authorPhoto: c.authorPhoto || null,
        authorLevel: c.authorLevel || 1,
        text: c.text,
        likeCount: c.likeCount || 0,
        likedByMe: liked.has(d.id),
        createdAt: c.createdAt?.toDate?.().toISOString() || null,
        mine: c.authorUid === caller.uid,
        canDelete: c.authorUid === caller.uid || canModerate,
      };
    });
    const top = all.filter((c) => !c.parentId).map((c) => ({ ...c, replies: all.filter((r) => r.parentId === c.id) }));
    return NextResponse.json({ ok: true, data: { comments: top, total: all.length } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const schema = z.object({
  text: z.string().trim().min(1).max(1500),
  parentId: z.string().optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const { postId } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "feed_comment", limit: 15, windowMs: 60_000 });
    if (limited) return limited;
    const { text, parentId } = await parseJson(req, schema);
    const { ref, post } = await loadVisiblePost(caller, postId);
    const profile = (await getPublicProfiles([caller.uid])).get(caller.uid);

    // Replies thread under the top-level comment (one level, like most social apps)
    let parent: FirebaseFirestore.DocumentData | null = null;
    let threadId: string | null = null;
    if (parentId) {
      const p = await ref.collection("comments").doc(parentId).get();
      if (!p.exists) throw new ApiError(404, "NOT_FOUND", "That comment was deleted.");
      parent = p.data()!;
      threadId = parent.parentId || parentId;
    }

    const cRef = ref.collection("comments").doc();
    const batch = adminDb().batch();
    batch.set(cRef, {
      authorUid: caller.uid,
      authorName: profile?.displayName || "Learner",
      authorUsername: profile?.username || null,
      authorPhoto: profile?.photoURL || null,
      authorLevel: profile?.level || 1,
      text,
      parentId: threadId,
      replyToName: parent ? parent.authorName : null,
      likeCount: 0,
      createdAt: Timestamp.now(),
    });
    batch.update(ref, { commentCount: FieldValue.increment(1) });
    if (threadId) batch.update(ref.collection("comments").doc(threadId), { replyCount: FieldValue.increment(1) });
    await batch.commit();
    await bumpChannels([`post:${postId}`]);

    const name = profile?.displayName || "Someone";
    const notified = new Set<string>([caller.uid]);
    if (parent && !notified.has(parent.authorUid)) {
      notified.add(parent.authorUid);
      await notify(parent.authorUid, { type: "comment", title: `${name} replied to your comment`, body: text.slice(0, 100), href: `/feed?post=${postId}`, icon: "↩️", actorUid: caller.uid });
    }
    if (!notified.has(post.authorUid)) {
      notified.add(post.authorUid);
      await notify(post.authorUid, {
        type: "comment",
        title: `${name} ${post.kind === "question" ? "answered your question" : "commented on your post"}`,
        body: text.slice(0, 100),
        href: `/feed?post=${postId}`,
        icon: "💬",
        actorUid: caller.uid,
      });
    }
    const mentioned = Array.from((await resolveMentions(extractMentions(text)).catch(() => new Map<string, string>())).values()).filter((u) => !notified.has(u));
    if (mentioned.length) {
      await notifyMany(mentioned, { type: "comment", title: `${name} mentioned you in a comment`, body: text.slice(0, 100), href: `/feed?post=${postId}`, icon: "📣", actorUid: caller.uid });
    }
    await trackProgress({ uid: caller.uid, stats: { comments: 1 }, reason: "comment" });
    return NextResponse.json({ ok: true, data: { id: cRef.id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
