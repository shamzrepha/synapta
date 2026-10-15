import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson, ApiError } from "@/lib/api/errors";
import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { bumpChannels } from "@/lib/live/server";

export const runtime = "nodejs";

const schema = z.object({ replyId: z.string().max(60).optional().nullable() });

/** Toggles the caller's upvote on a question (or one of its replies). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "ask_upvote", limit: 60, windowMs: 60_000 });
    if (limited) return limited;
    const { replyId } = await parseJson(req, schema);
    const qref = adminDb().collection("askQuestions").doc(id);
    const target = replyId ? qref.collection("replies").doc(replyId) : qref;
    const upRef = target.collection("upvotes").doc(caller.uid);
    const result = await adminDb().runTransaction(async (t) => {
      const [tSnap, up] = await Promise.all([t.get(target), t.get(upRef)]);
      if (!tSnap.exists || tSnap.data()!.deleted) throw new ApiError(404, "NOT_FOUND", "Not found");
      if (tSnap.data()!.authorUid === caller.uid) throw new ApiError(400, "VALIDATION", "You can't upvote your own post.");
      if (up.exists) {
        t.delete(upRef);
        t.update(target, { upvoteCount: FieldValue.increment(-1) });
        return { upvoted: false, count: Math.max(0, (tSnap.data()!.upvoteCount || 0) - 1) };
      }
      t.set(upRef, { at: Timestamp.now() });
      t.update(target, { upvoteCount: FieldValue.increment(1) });
      return { upvoted: true, count: (tSnap.data()!.upvoteCount || 0) + 1 };
    });
    await bumpChannels(["ask", `ask:${id}`]);
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return handleAuthError(error);
  }
}
