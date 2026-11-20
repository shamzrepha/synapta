import { adminDb } from "@/lib/firebase/admin";
import { memberRole } from "@/lib/communities/server";

/**
 * Who may read a stored file. Paths are `{scope}/{ownerUid}/{file}`.
 * The owner and admins always can. Anyone else only if the file is attached to something they are allowed to see:
 * an explainer video, a feed post, a poll option, a published studio design cover, or a post in a community they belong to.
 */
export async function canReadMedia(caller: { uid: string; role: string }, key: string): Promise<boolean> {
  const [, ownerUid] = key.split("/");
  if (caller.role === "admin" || ownerUid === caller.uid) return true;
  const db = adminDb();
  const url = `/api/media/${key}`;

  const [explainer, feed, cover, communityPost] = await Promise.all([
    db.collection("explainers").where("videoPath", "==", key).limit(1).get(),
    db.collection("posts").where("images", "array-contains", key).limit(1).get(),
    db.collection("designs").where("wall.coverPath", "==", key).limit(1).get(),
    db.collectionGroup("posts").where("image", "==", key).limit(5).get(),
  ]);
  if (!explainer.empty || !feed.empty || !cover.empty) return true;

  for (const d of communityPost.docs) {
    const [root, communityId] = d.ref.path.split("/");
    if (root === "communities" && communityId && (await memberRole(communityId, caller.uid))) return true;
  }

  // Poll option images are nested objects, so look through the recent polls the poll list itself shows.
  const polls = await db.collection("polls").orderBy("createdAt", "desc").limit(100).get();
  return polls.docs.some((p) => {
    const opts = p.data().options;
    return Array.isArray(opts) && opts.some((o: { image?: string | null }) => o?.image === url || o?.image === key);
  });
}
