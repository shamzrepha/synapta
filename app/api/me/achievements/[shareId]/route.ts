import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { createPost } from "@/lib/social/feed";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["post", "dismiss"]),
  /** Optional caption the learner adds above the achievement */
  caption: z.string().trim().max(500).optional(),
});

/** The learner chooses to post an achievement to the community, or dismiss it. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ shareId: string }> }) {
  try {
    const { shareId } = await params;
    const caller = await requireUser(req);
    const { action, caption } = await parseJson(req, schema);
    const ref = adminDb().collection("users").doc(caller.uid).collection("pendingShares").doc(shareId);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Already posted or dismissed");
    let postId: string | null = null;
    if (action === "post") {
      const d = snap.data()!;
      const text = caption ? `${d.text}\n\n${caption}` : String(d.text);
      postId = await createPost({ authorUid: caller.uid, text, kind: "achievement", visibility: "public", meta: d.meta || {} });
    }
    await ref.delete();
    return NextResponse.json({ ok: true, data: { postId } });
  } catch (error) {
    return handleAuthError(error);
  }
}
