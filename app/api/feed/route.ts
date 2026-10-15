import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { parseJson, ApiError } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { createPost, serializePost, withViewerState, type SerializedPost } from "@/lib/social/feed";
import { trackProgress } from "@/lib/game/progress";
import { attachmentSchema } from "@/lib/chat/store";
import { z } from "zod";

export const runtime = "nodejs";

const PAGE = 20;

/**
 * GET /api/feed?scope=global|class|following|tag|user&classId=&tag=&uid=&before=<ISO>
 * Timelines like a social network: everyone, a class, people you follow, a hashtag, or one person.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const sp = req.nextUrl.searchParams;
    const scope = sp.get("scope") || "global";
    const before = sp.get("before");
    const cursor = before ? Timestamp.fromDate(new Date(before)) : null;
    const posts = adminDb().collection("posts");
    let channel = "feed:global";
    let docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];

    const page = async (q: FirebaseFirestore.Query) => {
      let qq = q.orderBy("createdAt", "desc");
      if (cursor) qq = qq.startAfter(cursor);
      return (await qq.limit(PAGE).get()).docs;
    };

    if (scope === "class") {
      const classId = sp.get("classId") || "";
      await assertClassAccess(caller, classId, "view");
      docs = await page(posts.where("classId", "==", classId));
      channel = `feed:class:${classId}`;
    } else if (scope === "tag") {
      const tag = (sp.get("tag") || "").toLowerCase().replace(/^#/, "");
      if (!tag) throw new ApiError(400, "VALIDATION", "Missing hashtag");
      docs = await page(posts.where("hashtags", "array-contains", tag).where("visibility", "==", "public"));
    } else if (scope === "user") {
      const uid = sp.get("uid") || "";
      docs = await page(posts.where("authorUid", "==", uid).where("visibility", "==", "public"));
      channel = `feed:user:${uid}`;
    } else if (scope === "following") {
      const following = await adminDb().collection("users").doc(caller.uid).collection("following").limit(300).get();
      const authors = [caller.uid, ...following.docs.map((d) => d.id)];
      const chunks: string[][] = [];
      for (let i = 0; i < authors.length; i += 30) chunks.push(authors.slice(i, i + 30));
      const results = await Promise.all(chunks.map((c) => page(posts.where("authorUid", "in", c).where("visibility", "==", "public"))));
      docs = results
        .flat()
        .sort((a, b) => (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0))
        .slice(0, PAGE);
      channel = "feed:global";
    } else {
      docs = await page(posts.where("visibility", "==", "public"));
    }

    const serialized: SerializedPost[] = docs.map((d) => serializePost(d.id, d.data()));
    return NextResponse.json({
      ok: true,
      data: { posts: await withViewerState(serialized, caller.uid), hasMore: docs.length === PAGE, channel },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

const createSchema = z.object({
  text: z.string().trim().max(3000).default(""),
  kind: z.enum(["post", "question", "showcase"]).default("post"),
  classId: z.string().optional().nullable(),
  visibility: z.enum(["public", "class"]).default("public"),
  link: z.string().url().max(500).optional().nullable(),
  images: z.array(z.string().regex(/^posts\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/)).max(4).optional(),
  poll: z
    .object({
      options: z.array(z.string().trim().min(1).max(80)).min(2).max(4),
      durationHours: z.number().int().min(1).max(168).default(24),
    })
    .optional()
    .nullable(),
  attachment: attachmentSchema.optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "feed_post", limit: 6, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, createSchema);
    const text = body.text ?? "";
    const images = (body.images || []).filter((p) => p.startsWith(`posts/${caller.uid}/`));

    if (!text && images.length === 0 && !body.poll && !body.attachment) throw new ApiError(400, "VALIDATION", "Write something, add a photo or a poll.");
    if (body.poll && !text) throw new ApiError(400, "VALIDATION", "Polls need a question.");
    if (body.visibility === "class" && !body.classId) throw new ApiError(400, "VALIDATION", "Pick a class for a class-only post.");
    if (body.classId) {
      const access = await assertClassAccess(caller, body.classId, "view");
      if (!access.canMutate && !access.isEnrolled) throw new ApiError(403, "FORBIDDEN", "Join this class to post in it.");
    }
    if (body.link && !/^https?:\/\//i.test(body.link)) throw new ApiError(400, "VALIDATION", "Links must start with http:// or https://");

    const id = await createPost({
      authorUid: caller.uid,
      text,
      kind: body.kind ?? "post",
      classId: body.classId || null,
      visibility: body.visibility ?? "public",
      link: body.link || null,
      images,
      poll: body.poll ? { options: body.poll.options, durationHours: body.poll.durationHours ?? 24 } : null,
      attachment: body.attachment || null,
    });
    await trackProgress({ uid: caller.uid, stats: { posts: 1 }, reason: "post" });
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
