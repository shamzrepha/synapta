import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { parseJson, ApiError } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { createPost } from "@/lib/social/feed";
import { trackProgress } from "@/lib/game/progress";
import { z } from "zod";

export const runtime = "nodejs";

const PAGE = 20;

function serialize(d: FirebaseFirestore.QueryDocumentSnapshot) {
  const p = d.data();
  return {
    id: d.id,
    authorUid: p.authorUid,
    authorName: p.authorName,
    authorUsername: p.authorUsername || null,
    authorPhoto: p.authorPhoto || null,
    authorLevel: p.authorLevel || 1,
    authorRole: p.authorRole || "student",
    kind: p.kind,
    text: p.text,
    link: p.link || null,
    classId: p.classId || null,
    visibility: p.visibility,
    meta: p.meta || {},
    likeCount: p.likeCount || 0,
    commentCount: p.commentCount || 0,
    createdAt: p.createdAt?.toDate?.().toISOString() || null,
  };
}

/** GET /api/feed?scope=global|class&classId=…&before=<ISO> */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const sp = req.nextUrl.searchParams;
    const scope = sp.get("scope") === "class" ? "class" : "global";
    const before = sp.get("before");

    let q: FirebaseFirestore.Query = adminDb().collection("posts");
    let channel = "feed:global";
    if (scope === "class") {
      const classId = sp.get("classId") || "";
      await assertClassAccess(caller, classId, "view");
      q = q.where("classId", "==", classId);
      channel = `feed:class:${classId}`;
    } else {
      q = q.where("visibility", "==", "public");
    }
    q = q.orderBy("createdAt", "desc");
    if (before) q = q.startAfter(Timestamp.fromDate(new Date(before)));
    const snap = await q.limit(PAGE).get();
    const posts = snap.docs.map(serialize);

    // Which of these has the caller liked?
    const likeRefs = posts.map((p) => adminDb().collection("posts").doc(p.id).collection("likes").doc(caller.uid));
    const likeSnaps = likeRefs.length ? await adminDb().getAll(...likeRefs) : [];
    const liked = new Set(likeSnaps.filter((s) => s.exists).map((s) => s.ref.parent.parent!.id));

    return NextResponse.json({
      ok: true,
      data: {
        posts: posts.map((p) => ({ ...p, likedByMe: liked.has(p.id), mine: p.authorUid === caller.uid })),
        hasMore: snap.size === PAGE,
        channel,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

const createSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  kind: z.enum(["post", "question", "showcase"]).default("post"),
  classId: z.string().optional().nullable(),
  visibility: z.enum(["public", "class"]).default("public"),
  link: z.string().url().max(500).optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "feed_post", limit: 6, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, createSchema);

    if (body.visibility === "class" && !body.classId) {
      throw new ApiError(400, "VALIDATION", "Pick a class for a class-only post.");
    }
    if (body.classId) {
      const access = await assertClassAccess(caller, body.classId, "view");
      if (!access.canMutate && !access.isEnrolled) {
        throw new ApiError(403, "FORBIDDEN", "Join this class to post in it.");
      }
    }
    if (body.link && !/^https?:\/\//i.test(body.link)) {
      throw new ApiError(400, "VALIDATION", "Links must start with http:// or https://");
    }

    const id = await createPost({
      authorUid: caller.uid,
      text: body.text,
      kind: body.kind ?? "post",
      classId: body.classId || null,
      visibility: body.visibility ?? "public",
      link: body.link || null,
    });
    await trackProgress({ uid: caller.uid, stats: { posts: 1 }, reason: "post" });
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
