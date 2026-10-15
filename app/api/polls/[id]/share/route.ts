import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { createPost } from "@/lib/social/feed";

export const runtime = "nodejs";

/** Shares the poll to the public feed as a post with a poll card attachment. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "poll_share", limit: 6, windowMs: 3600_000 });
    if (limited) return limited;
    const s = await adminDb().collection("polls").doc(id).get();
    if (!s.exists || s.data()!.deleted) throw new ApiError(404, "NOT_FOUND", "Poll not found");
    const p = s.data()!;
    const postId = await createPost({
      authorUid: caller.uid,
      text: `Vote on this: ${String(p.question).slice(0, 200)}`,
      kind: "post",
      visibility: "public",
      attachment: { type: "topic", id, title: String(p.question).slice(0, 200), subtitle: p.kind === "thisorthat" ? "This or that" : "Poll", href: `/polls?id=${id}`, emoji: "📊" },
    });
    return NextResponse.json({ ok: true, data: { postId } });
  } catch (error) {
    return handleAuthError(error);
  }
}
