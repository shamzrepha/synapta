import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { bumpChannels } from "@/lib/live/server";
import { notify } from "@/lib/notifications/server";
import { trackProgress } from "@/lib/game/progress";
import type { Reaction } from "./feed";

const EMOJI: Record<Reaction, string> = { like: "👍", love: "❤️", haha: "😂", wow: "🤯", celebrate: "🎉" };

/** Sets, changes or removes (null) the caller's reaction on a post; keeps per-emoji counts in sync. */
export async function setReaction(params: {
  postRef: FirebaseFirestore.DocumentReference;
  post: FirebaseFirestore.DocumentData;
  uid: string;
  reaction: Reaction | null;
}) {
  const { postRef, post, uid, reaction } = params;
  const rRef = postRef.collection("reactions").doc(uid);
  const result = await adminDb().runTransaction(async (t) => {
    const [cur, p] = await Promise.all([t.get(rRef), t.get(postRef)]);
    const prev = cur.exists ? (cur.data()!.emoji as Reaction) : null;
    const counts = { ...(p.data()?.reactionCounts || {}) } as Record<string, number>;
    if (prev === reaction) return { reaction: prev, counts, added: false };
    const update: Record<string, unknown> = {};
    if (prev) {
      update[`reactionCounts.${prev}`] = FieldValue.increment(-1);
      counts[prev] = Math.max(0, (counts[prev] || 0) - 1);
    }
    if (reaction) {
      update[`reactionCounts.${reaction}`] = FieldValue.increment(1);
      counts[reaction] = (counts[reaction] || 0) + 1;
      t.set(rRef, { uid, emoji: reaction, createdAt: Timestamp.now() });
    } else {
      t.delete(rRef);
    }
    const delta = (reaction ? 1 : 0) - (prev ? 1 : 0);
    if (delta !== 0) update.likeCount = FieldValue.increment(delta);
    t.update(postRef, update);
    return { reaction, counts, added: !prev && !!reaction };
  });

  await bumpChannels([`post:${postRef.id}`]);
  if (result.added && post.authorUid !== uid) {
    const me = await adminDb().collection("users").doc(uid).get();
    await notify(post.authorUid, {
      type: "like",
      title: `${me.data()?.displayName || "Someone"} reacted ${EMOJI[reaction as Reaction]} to your post`,
      body: String(post.text || "").slice(0, 80),
      href: `/feed?post=${postRef.id}`,
      icon: EMOJI[reaction as Reaction],
      actorUid: uid,
    });
    await trackProgress({ uid: post.authorUid, stats: { likesReceived: 1 }, countsForQuests: false });
  }
  const total = Object.values(result.counts).reduce((a, b) => a + (b || 0), 0);
  return { myReaction: result.reaction, reactionCounts: result.counts, likeCount: total };
}
