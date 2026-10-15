import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";

/** Resolves a profile reference: a username (preferred in URLs) or a uid. */
export async function resolveUserRef(ref: string): Promise<{ uid: string; data: FirebaseFirestore.DocumentData } | null> {
  const byName = await adminDb().collection("users").where("username", "==", ref.toLowerCase()).limit(1).get();
  if (!byName.empty) return { uid: byName.docs[0].id, data: byName.docs[0].data() };
  const byId = await adminDb().collection("users").doc(ref).get();
  return byId.exists ? { uid: byId.id, data: byId.data()! } : null;
}

export async function isFollowing(uid: string, target: string): Promise<boolean> {
  return (await adminDb().collection("users").doc(uid).collection("following").doc(target).get()).exists;
}

/** Follow/unfollow with mirrored follower records and counters, in one transaction. */
export async function setFollow(uid: string, target: string, follow: boolean): Promise<boolean> {
  const db = adminDb();
  const followingRef = db.collection("users").doc(uid).collection("following").doc(target);
  const followerRef = db.collection("users").doc(target).collection("followers").doc(uid);
  return db.runTransaction(async (t) => {
    const cur = await t.get(followingRef);
    if (cur.exists === follow) return false;
    if (follow) {
      t.set(followingRef, { uid: target, at: Timestamp.now() });
      t.set(followerRef, { uid, at: Timestamp.now() });
    } else {
      t.delete(followingRef);
      t.delete(followerRef);
    }
    t.update(db.collection("users").doc(uid), { followingCount: FieldValue.increment(follow ? 1 : -1) });
    t.update(db.collection("users").doc(target), { followerCount: FieldValue.increment(follow ? 1 : -1) });
    return true;
  });
}
