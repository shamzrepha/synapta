import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson, ApiError } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { notify } from "@/lib/notifications/server";
import { chatRef, directChatId } from "@/lib/chat/store";
import { getPublicProfiles } from "@/lib/social/profile";
import { canAct } from "@/lib/mentors/matching";

export const runtime = "nodejs";

const schema = z.object({ action: z.enum(["accept", "decline", "cancel"]) });

/** Creates the DM for an accepted pairing, or reuses the existing one (mentoring pairs don't have to be friends). */
async function ensureMentorChat(a: string, b: string): Promise<string> {
  const id = directChatId(a, b);
  const ref = chatRef(id);
  if (!(await ref.get()).exists) {
    await ref.set({
      id,
      type: "direct",
      memberIds: [a, b].sort(),
      name: null,
      createdBy: a,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      lastMessage: null,
      unread: { [a]: 0, [b]: 0 },
    });
  }
  return id;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const { action } = await parseJson(req, schema);
    const ref = adminDb().collection("mentorRequests").doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Request not found");
    const r = snap.data()!;
    if (r.fromUid !== caller.uid && r.toUid !== caller.uid) throw new ApiError(403, "FORBIDDEN", "Not your request.");
    if (!canAct(action, r.status, caller.uid, { fromUid: r.fromUid, toUid: r.toUid })) throw new ApiError(409, "CONFLICT", "That isn't possible for this request.");

    if (action === "cancel") {
      await ref.update({ status: "cancelled", updatedAt: Timestamp.now() });
      return NextResponse.json({ ok: true, data: { status: "cancelled" } });
    }
    const name = (await getPublicProfiles([caller.uid])).get(caller.uid)?.displayName || "Someone";
    if (action === "decline") {
      await ref.update({ status: "declined", updatedAt: Timestamp.now() });
      await notify(r.fromUid, { type: "friend", title: `${name} can't take your mentoring request right now`, href: "/mentors?tab=requests", icon: "🧭", actorUid: caller.uid, actorName: name });
      return NextResponse.json({ ok: true, data: { status: "declined" } });
    }
    const chatId = await ensureMentorChat(r.mentorUid, r.menteeUid);
    await ref.update({ status: "accepted", chatId, acceptedAt: Timestamp.now(), updatedAt: Timestamp.now() });
    await notify(r.fromUid, { type: "friend", title: `${name} accepted your mentoring request`, body: "Say hi in the chat", href: `/messages?chat=${chatId}`, icon: "🧭", actorUid: caller.uid, actorName: name });
    return NextResponse.json({ ok: true, data: { status: "accepted", chatId } });
  } catch (error) {
    return handleAuthError(error);
  }
}
