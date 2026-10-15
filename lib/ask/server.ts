import { adminDb } from "@/lib/firebase/admin";
import { iso } from "@/lib/community/util";
import { getPublicProfiles } from "@/lib/social/profile";
import { publicAuthor } from "./rules";

/**
 * Serializers for anonymous questions. The stored `authorUid` of a question is NEVER copied into a
 * response (admins excepted); named replies expose only the public profile the author chose to show.
 */

export function serializeQuestion(id: string, q: FirebaseFirestore.DocumentData, viewerUid: string, isAdmin: boolean, upvoted: boolean) {
  return {
    id,
    text: String(q.text || ""),
    subject: (q.subject as string) || null,
    upvoteCount: q.upvoteCount || 0,
    answerCount: q.answerCount || 0,
    acceptedReplyId: (q.acceptedReplyId as string) || null,
    createdAt: iso(q.createdAt),
    upvotedByMe: upvoted,
    ...publicAuthor({ authorUid: q.authorUid }, viewerUid, isAdmin),
  };
}

export async function serializeReplies(
  qid: string,
  viewerUid: string,
  isAdmin: boolean
) {
  const col = adminDb().collection("askQuestions").doc(qid).collection("replies");
  const snap = await col.orderBy("createdAt", "asc").limit(200).get();
  const refs = snap.docs.map((d) => d.ref.collection("upvotes").doc(viewerUid));
  const ups = refs.length ? await adminDb().getAll(...refs) : [];
  const upvoted = new Set(ups.filter((s) => s.exists).map((s) => s.ref.parent.parent!.id));
  const named = snap.docs.filter((d) => !d.data().anonymous).map((d) => d.data().authorUid as string);
  const profiles = await getPublicProfiles(named);
  const replies = snap.docs.map((d) => {
    const r = d.data();
    const p = r.anonymous ? null : profiles.get(r.authorUid);
    return {
      id: d.id,
      text: String(r.text || ""),
      anonymous: !!r.anonymous,
      authorName: p ? p.displayName : null,
      authorUsername: p ? p.username : null,
      authorPhoto: p ? p.photoURL : null,
      upvoteCount: r.upvoteCount || 0,
      upvotedByMe: upvoted.has(d.id),
      createdAt: iso(r.createdAt),
      ...publicAuthor({ authorUid: r.authorUid }, viewerUid, isAdmin),
    };
  });
  return replies;
}
