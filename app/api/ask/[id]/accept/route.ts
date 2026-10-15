import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson, ApiError } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { bumpChannels } from "@/lib/live/server";
import { notify } from "@/lib/notifications/server";
import { trackProgress } from "@/lib/game/progress";
import { canAccept } from "@/lib/ask/rules";

export const runtime = "nodejs";

const schema = z.object({ replyId: z.string().min(1).max(60).nullable() });

/** The asker (identity checked here, on the server) marks one reply as accepted, or clears it with null. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const { replyId } = await parseJson(req, schema);
    const qref = adminDb().collection("askQuestions").doc(id);
    const q = await qref.get();
    if (!q.exists || q.data()!.deleted) throw new ApiError(404, "NOT_FOUND", "Question not found");
    if (q.data()!.authorUid !== caller.uid) throw new ApiError(403, "FORBIDDEN", "Only the person who asked can accept an answer.");
    if (!replyId) {
      await qref.update({ acceptedReplyId: null });
    } else {
      const rref = qref.collection("replies").doc(replyId);
      const r = await rref.get();
      if (!r.exists) throw new ApiError(404, "NOT_FOUND", "Reply not found");
      if (!canAccept(q.data()!.authorUid, caller.uid, r.data()!.authorUid)) throw new ApiError(400, "VALIDATION", "You can't accept your own reply.");
      await qref.update({ acceptedReplyId: replyId });
      // reward once per reply
      if (!r.data()!.xpGiven) {
        await rref.update({ xpGiven: true });
        await trackProgress({ uid: r.data()!.authorUid, xpToAward: 15, stats: { peerHelps: 1 }, reason: "ask_accepted" });
        await notify(r.data()!.authorUid, { type: "badge", title: "Your answer was accepted", body: "+15 XP for helping a classmate", href: `/ask?q=${id}`, icon: "✅" });
      }
    }
    await bumpChannels(["ask", `ask:${id}`]);
    return NextResponse.json({ ok: true, data: { acceptedReplyId: replyId } });
  } catch (error) {
    return handleAuthError(error);
  }
}
