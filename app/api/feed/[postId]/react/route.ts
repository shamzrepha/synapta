import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { loadVisiblePost } from "@/lib/social/access";
import { setReaction } from "@/lib/social/reactions";
import { REACTIONS } from "@/lib/social/feed";
import { checkRateLimit } from "@/lib/rateLimit";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({ reaction: z.enum(REACTIONS).nullable() });

/** Set (or clear with null) the caller's emoji reaction. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const { postId } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "feed_react", limit: 90, windowMs: 60_000 });
    if (limited) return limited;
    const { reaction } = await parseJson(req, schema);
    const { ref, post } = await loadVisiblePost(caller, postId);
    return NextResponse.json({ ok: true, data: await setReaction({ postRef: ref, post, uid: caller.uid, reaction }) });
  } catch (error) {
    return handleAuthError(error);
  }
}
