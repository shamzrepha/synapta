import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson, ApiError } from "@/lib/api/errors";
import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { bumpChannels } from "@/lib/live/server";
import { notify } from "@/lib/notifications/server";
import { validateReply } from "@/lib/ask/rules";

export const runtime = "nodejs";

const schema = z.object({ text: z.string().max(4000), anonymous: z.boolean().default(false) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "ask_reply", limit: 20, windowMs: 3600_000 });
    if (limited) return limited;
    const body = await parseJson(req, schema);
    const v = validateReply(body.text);
    if (!v.ok) throw new ApiError(400, "VALIDATION", v.message);
    const qref = adminDb().collection("askQuestions").doc(id);
    const q = await qref.get();
    if (!q.exists || q.data()!.deleted) throw new ApiError(404, "NOT_FOUND", "Question not found");
    const rref = qref.collection("replies").doc();
    await rref.set({
      id: rref.id,
      authorUid: caller.uid, // server-side only
      anonymous: body.anonymous,
      text: v.text,
      upvoteCount: 0,
      createdAt: Timestamp.now(),
    });
    await qref.update({ answerCount: FieldValue.increment(1) });
    // Notify the asker without naming the replier (no actorUid)
    if (q.data()!.authorUid !== caller.uid) {
      await notify(q.data()!.authorUid, {
        type: "comment",
        title: "Someone answered your anonymous question",
        body: v.text.slice(0, 100),
        href: `/ask?q=${id}`,
        icon: "🙈",
      });
    }
    await bumpChannels(["ask", `ask:${id}`]);
    return NextResponse.json({ ok: true, data: { id: rref.id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
