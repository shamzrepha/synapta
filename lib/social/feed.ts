import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { bumpChannels } from "@/lib/live/server";
import { notifyMany } from "@/lib/notifications/server";
import { getPublicProfiles } from "./profile";
import { extractHashtags, extractMentions } from "./text";

export type PostKind = "post" | "question" | "showcase" | "achievement" | "repost";

export const REACTIONS = ["like", "love", "haha", "wow", "celebrate"] as const;
export type Reaction = (typeof REACTIONS)[number];

export interface PollInput {
  options: string[];
  durationHours: number;
}

export interface RepostSnapshot {
  id: string;
  authorUid: string;
  authorName: string;
  authorPhoto: string | null;
  kind: string;
  text: string;
  images: string[];
  createdAt: string | null;
}

export interface CreatePostInput {
  authorUid: string;
  text: string;
  kind: PostKind;
  classId?: string | null;
  /** "public" shows on the global feed; "class" only to that class */
  visibility: "public" | "class";
  link?: string | null;
  images?: string[];
  poll?: PollInput | null;
  repostOf?: RepostSnapshot | null;
  /** Shared card: a study room, challenge, notebook, badge, topic… */
  attachment?: Record<string, unknown> | null;
  meta?: Record<string, unknown>;
}

export function feedChannels(classId?: string | null, visibility: "public" | "class" = "public"): string[] {
  const ch: string[] = [];
  if (visibility === "public") ch.push("feed:global");
  if (classId) ch.push(`feed:class:${classId}`);
  return ch;
}

/** Resolves @usernames to uids (max 10). */
export async function resolveMentions(usernames: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (usernames.length === 0) return out;
  const snap = await adminDb().collection("users").where("username", "in", usernames.slice(0, 10)).get();
  snap.docs.forEach((d) => out.set(String(d.data().username).toLowerCase(), d.id));
  return out;
}

async function bumpHashtags(tags: string[]) {
  const day = new Date().toISOString().slice(0, 10);
  await Promise.all(
    tags.map((tag) =>
      adminDb()
        .collection("hashtagStats")
        .doc(tag)
        .set({ tag, total: FieldValue.increment(1), lastUsedAt: Timestamp.now(), [`days.${day}`]: FieldValue.increment(1) }, { merge: true })
        .catch(() => null)
    )
  );
}

export async function createPost(input: CreatePostInput): Promise<string> {
  const profiles = await getPublicProfiles([input.authorUid]);
  const p = profiles.get(input.authorUid);
  const ref = adminDb().collection("posts").doc();
  const hashtags = extractHashtags(input.text);
  const mentionNames = extractMentions(input.text);
  const mentionMap = await resolveMentions(mentionNames).catch(() => new Map<string, string>());
  const mentionUids = Array.from(mentionMap.values()).filter((u) => u !== input.authorUid);

  const poll = input.poll
    ? {
        options: input.poll.options.map((text, i) => ({ id: `o${i}`, text, votes: 0 })),
        totalVotes: 0,
        endsAt: Timestamp.fromMillis(Date.now() + input.poll.durationHours * 3600 * 1000),
      }
    : null;

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
    images: input.images || [],
    poll,
    repostOf: input.repostOf || null,
    attachment: input.attachment || null,
    hashtags,
    mentionUids,
    classId: input.classId || null,
    visibility: input.visibility,
    meta: input.meta || {},
    likeCount: 0,
    reactionCounts: {},
    commentCount: 0,
    repostCount: 0,
    deleted: false,
    createdAt: Timestamp.now(),
  });

  if (hashtags.length) await bumpHashtags(hashtags);
  if (mentionUids.length) {
    await notifyMany(mentionUids, {
      type: "comment",
      title: `${p?.displayName || "Someone"} mentioned you`,
      body: input.text.slice(0, 100),
      href: `/feed?post=${ref.id}`,
      icon: "📣",
      actorUid: input.authorUid,
    });
  }
  // Followers' "Following" feeds refresh live
  await bumpChannels([...feedChannels(input.classId, input.visibility), `feed:user:${input.authorUid}`]);
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

function iso(v: unknown): string | null {
  const t = v as { toDate?: () => Date } | undefined;
  return t?.toDate ? t.toDate().toISOString() : null;
}

export function serializePost(id: string, p: FirebaseFirestore.DocumentData) {
  const poll = p.poll
    ? {
        options: (p.poll.options || []).map((o: { id: string; text: string; votes: number }) => ({ id: o.id, text: o.text, votes: o.votes || 0 })),
        totalVotes: p.poll.totalVotes || 0,
        endsAt: iso(p.poll.endsAt),
        closed: p.poll.endsAt?.toMillis ? p.poll.endsAt.toMillis() < Date.now() : false,
      }
    : null;
  return {
    id,
    authorUid: p.authorUid,
    authorName: p.authorName,
    authorUsername: p.authorUsername || null,
    authorPhoto: p.authorPhoto || null,
    authorLevel: p.authorLevel || 1,
    authorRole: p.authorRole || "student",
    kind: p.kind,
    text: p.text || "",
    link: p.link || null,
    images: Array.isArray(p.images) ? p.images : [],
    poll,
    repostOf: p.repostOf || null,
    attachment: (p.attachment as { type: string; id: string; title: string; subtitle?: string; href: string; emoji?: string } | null) || null,
    hashtags: p.hashtags || [],
    classId: p.classId || null,
    visibility: p.visibility,
    meta: p.meta || {},
    likeCount: p.likeCount || 0,
    reactionCounts: (p.reactionCounts || {}) as Partial<Record<Reaction, number>>,
    commentCount: p.commentCount || 0,
    repostCount: p.repostCount || 0,
    createdAt: iso(p.createdAt),
    editedAt: iso(p.editedAt),
  };
}

export type SerializedPost = ReturnType<typeof serializePost>;

/** Adds the caller's own state (reaction, poll vote, bookmark) to a page of posts in 3 batched reads. */
export async function withViewerState(posts: SerializedPost[], uid: string) {
  if (posts.length === 0) return [];
  const db = adminDb();
  const reactRefs = posts.map((p) => db.collection("posts").doc(p.id).collection("reactions").doc(uid));
  const voteRefs = posts.filter((p) => p.poll).map((p) => db.collection("posts").doc(p.id).collection("pollVotes").doc(uid));
  const bookmarkRefs = posts.map((p) => db.collection("users").doc(uid).collection("bookmarks").doc(`post_${p.id}`));
  const [reacts, votes, marks] = await Promise.all([
    db.getAll(...reactRefs),
    voteRefs.length ? db.getAll(...voteRefs) : Promise.resolve([]),
    db.getAll(...bookmarkRefs),
  ]);
  const reactionBy = new Map(reacts.filter((s) => s.exists).map((s) => [s.ref.parent.parent!.id, s.data()!.emoji as Reaction]));
  const voteBy = new Map(votes.filter((s) => s.exists).map((s) => [s.ref.parent.parent!.id, s.data()!.optionId as string]));
  const marked = new Set(marks.filter((s) => s.exists).map((s) => s.id.replace(/^post_/, "")));
  return posts.map((p) => ({
    ...p,
    myReaction: reactionBy.get(p.id) || null,
    likedByMe: reactionBy.has(p.id),
    myVote: voteBy.get(p.id) || null,
    bookmarked: marked.has(p.id),
    mine: p.authorUid === uid,
  }));
}
