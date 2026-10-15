import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { loadVisiblePost } from "@/lib/social/access";
import { bumpChannels } from "@/lib/live/server";
import { notify } from "@/lib/notifications/server";
import { getPublicProfiles } from "@/lib/social/profile";
import { trackProgress } from "@/lib/game/progress";
import { checkRateLimit } from "@/lib/rateLimit";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const { postId } = await params;
    const caller = await requireUser(req);
    const { ref } = await loadVisiblePost(caller, postId);
    const snap = await ref.collection("comments").orderBy("createdAt", "asc").limit(100).get();
    return NextResponse.json({
      ok: true,
      data: {
        comments: snap.docs.map((d) => {
          const c = d.data();
          return {
            id: d.id,
            authorUid: c.authorUid,
            authorName: c.authorName,
            authorPhoto: c.authorPhoto || null,
            authorLevel: c.authorLevel || 1,
            text: c.text,
            createdAt: c.createdAt?.toDate?.().toISOString() || null,
            mine: c.authorUid === caller.uid,
          };
        }),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

const schema = z.object({ text: z.string().trim().min(1).max(1000) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const { postId } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "feed_comment", limit: 12, windowMs: 60_000 });
    if (limited) return limited;
    const { text } = await parseJson(req, schema);
    const { ref, post } = await loadVisiblePost(caller, postId);
    const profile = (await getPublicProfiles([caller.uid])).get(caller.uid);

    const cRef = ref.collection("comments").doc();
    const batch = adminDb().batch();
    batch.set(cRef, {
      authorUid: caller.uid,
      authorName: profile?.displayName || "Learner",
      authorPhoto: profile?.photoURL || null,
      authorLevel: profile?.level || 1,
      text,
      createdAt: Timestamp.now(),
    });
    batch.update(ref, { commentCount: FieldValue.increment(1) });
    await batch.commit();

    await bumpChannels([`post:${postId}`]);
    if (post.authorUid !== caller.uid) {
      await notify(post.authorUid, {
        type: "comment",
        title: `${profile?.displayName || "Someone"} ${post.kind === "question" ? "answered your question" : "commented on your post"}`,
        body: text.slice(0, 100),
        href: `/feed?post=${postId}`,
        icon: "💬",
        actorUid: caller.uid,
      });
    }
    await trackProgress({ uid: caller.uid, stats: { comments: 1 }, reason: "comment" });
    return NextResponse.json({ ok: true, data: { id: cRef.id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
