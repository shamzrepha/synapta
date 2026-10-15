import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { bumpChannels } from "@/lib/live/server";
import { getPublicProfiles } from "./profile";

export type PostKind = "post" | "question" | "showcase" | "achievement";

export interface CreatePostInput {
  authorUid: string;
  text: string;
  kind: PostKind;
  classId?: string | null;
  /** "public" shows on the global feed; "class" only to that class */
  visibility: "public" | "class";
  link?: string | null;
  meta?: Record<string, unknown>;
}

export function feedChannels(classId?: string | null, visibility: "public" | "class" = "public"): string[] {
  const ch: string[] = [];
  if (visibility === "public") ch.push("feed:global");
  if (classId) ch.push(`feed:class:${classId}`);
  return ch;
}

export async function createPost(input: CreatePostInput): Promise<string> {
  const profiles = await getPublicProfiles([input.authorUid]);
  const p = profiles.get(input.authorUid);
  const ref = adminDb().collection("posts").doc();
  await ref.set({
    id: ref.id,
    authorUid: input.authorUid,
    authorName: p?.displayName || "Learner",
    authorUsername: p?.username || null,
    authorPhoto: p?.photoURL || null,
    authorLevel: p?.level || 1,
    authorRole: p?.role || "student",
    kind: input.kind,
    text: input.text,
    link: input.link || null,
    classId: input.classId || null,
    visibility: input.visibility,
    meta: input.meta || {},
    likeCount: 0,
    commentCount: 0,
    deleted: false,
    createdAt: Timestamp.now(),
  });
  await bumpChannels(feedChannels(input.classId, input.visibility));
  return ref.id;
}

/** Auto-shares an achievement unless the user turned sharing off in settings. */
export async function shareAchievement(uid: string, text: string, meta: Record<string, unknown>): Promise<void> {
  try {
    const user = await adminDb().collection("users").doc(uid).get();
    if (user.data()?.settings?.autoShareAchievements === false) return;
    await createPost({ authorUid: uid, text, kind: "achievement", visibility: "public", meta });
  } catch {
    // Sharing is a nice-to-have; never break the learning flow
  }
}
