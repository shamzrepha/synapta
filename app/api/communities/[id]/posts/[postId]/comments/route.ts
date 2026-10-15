import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb, FieldValue } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { getPublicProfiles } from "@/lib/social/profile";
import { MAX_COMMENT_CHARS } from "@/lib/communities/rules";
import { communityRef, requireMember } from "@/lib/communities/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; postId: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const caller = await requireUser(req);
    const { id, postId } = await params;
    const role = await requireMember(id, caller.uid);
    const snap = await communityRef(id).collection("posts").doc(postId).collection("comments").orderBy("createdAtMs", "asc").limit(100).get();
    const profiles = await getPublicProfiles(snap.docs.map((d) => d.data().authorUid));
    const data = snap.docs.map((d) => {
      const x = d.data();
      const p = profiles.get(x.authorUid);
      return {
        id: d.id,
        text: x.text,
        createdAtMs: x.createdAtMs,
        author: { uid: x.authorUid, displayName: p?.displayName || "Learner", photoURL: p?.photoURL || null },
        canDelete: role === "owner" || x.authorUid === caller.uid,
      };
    });
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "community_comment", limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const { id, postId } = await params;
    await requireMember(id, caller.uid);
    const { text } = await parseJson(req, z.object({ text: z.string().max(MAX_COMMENT_CHARS) }));
    if (!text.trim()) throw new ApiError(400, "VALIDATION", "Write a comment first.");
    const postRef = communityRef(id).collection("posts").doc(postId);
    if (!(await postRef.get()).exists) throw new ApiError(404, "NOT_FOUND", "Post not found.");
    const ref = await postRef.collection("comments").add({ authorUid: caller.uid, text: text.trim(), createdAtMs: Date.now() });
    await postRef.update({ commentCount: FieldValue.increment(1) });
    return NextResponse.json({ ok: true, data: { id: ref.id } });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Delete a comment (?cid=): its author or the community owner. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const caller = await requireUser(req);
    const { id, postId } = await params;
    const role = await requireMember(id, caller.uid);
    const cid = req.nextUrl.searchParams.get("cid") || "";
    if (!cid) throw new ApiError(400, "VALIDATION", "Missing comment id.");
    const postRef = communityRef(id).collection("posts").doc(postId);
    const cRef = postRef.collection("comments").doc(cid);
    const snap = await cRef.get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Comment not found.");
    if (role !== "owner" && snap.data()!.authorUid !== caller.uid) throw new ApiError(403, "FORBIDDEN", "You can't delete this comment.");
    await adminDb().batch().delete(cRef).update(postRef, { commentCount: FieldValue.increment(-1) }).commit();
    return NextResponse.json({ ok: true, data: { id: cid } });
  } catch (error) {
    return handleAuthError(error);
  }
}
