import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { getPublicProfiles } from "@/lib/social/profile";
import { MAX_POST_CHARS, postTags, sortPosts } from "@/lib/communities/rules";
import { communityRef, requireMember } from "@/lib/communities/server";

export const runtime = "nodejs";

const postSchema = z.object({
  text: z.string().max(MAX_POST_CHARS),
  image: z.string().max(200).optional(),
  pinned: z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireUser(req);
    const { id } = await params;
    const role = await requireMember(id, caller.uid);
    const tag = (req.nextUrl.searchParams.get("tag") || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
    const col = communityRef(id).collection("posts");
    let docs = (await col.orderBy("createdAtMs", "desc").limit(100).get()).docs;
    if (tag) docs = docs.filter((d) => (d.data().tags || []).includes(tag));
    const posts = sortPosts(docs.map((d) => ({ doc: d, createdAtMs: d.data().createdAtMs as number, pinned: !!d.data().pinned }))).slice(0, 50);

    const [profiles, likes] = await Promise.all([
      getPublicProfiles(posts.map((p) => p.doc.data().authorUid)),
      posts.length ? adminDb().getAll(...posts.map((p) => col.doc(p.doc.id).collection("likes").doc(caller.uid))) : Promise.resolve([]),
    ]);
    const data = posts.map((p, i) => {
      const x = p.doc.data();
      const a = profiles.get(x.authorUid);
      return {
        id: p.doc.id,
        text: x.text,
        image: x.image || null,
        tags: x.tags || [],
        pinned: !!x.pinned,
        likeCount: x.likeCount || 0,
        commentCount: x.commentCount || 0,
        liked: likes[i]?.exists || false,
        createdAtMs: x.createdAtMs,
        author: { uid: x.authorUid, displayName: a?.displayName || "Learner", photoURL: a?.photoURL || null },
        canDelete: role === "owner" || x.authorUid === caller.uid,
      };
    });
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireUser(req);
    const { id } = await params;
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "community_post", limit: 10, windowMs: 60_000 });
    if (limited) return limited;
    const role = await requireMember(id, caller.uid);
    const body = await parseJson(req, postSchema);
    const text = body.text.trim();
    if (!text && !body.image) throw new ApiError(400, "VALIDATION", "Write something first.");
    if (body.image && !new RegExp(`^posts/${caller.uid}/[A-Za-z0-9_.-]+$`).test(body.image)) {
      throw new ApiError(400, "VALIDATION", "Invalid image.");
    }
    const now = Date.now();
    const ref = await communityRef(id)
      .collection("posts")
      .add({
        authorUid: caller.uid,
        text,
        image: body.image || null,
        tags: postTags(text),
        pinned: role === "owner" && body.pinned === true,
        likeCount: 0,
        commentCount: 0,
        createdAtMs: now,
        createdAt: Timestamp.fromMillis(now),
      });
    return NextResponse.json({ ok: true, data: { id: ref.id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
