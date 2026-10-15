import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { Timestamp } from "@/lib/firebase/admin";
import { loadChatForMember } from "@/lib/chat/store";
import { bumpChannel, bumpUserSignal } from "@/lib/live/server";

export const runtime = "nodejs";

/** Marks the conversation read (clears the unread badge and powers "Seen" receipts). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await params;
    const caller = await requireUser(req);
    const { ref, chat } = await loadChatForMember(chatId, caller.uid);
    const hadUnread = (chat.unread?.[caller.uid] || 0) > 0;
    await ref.update({ [`unread.${caller.uid}`]: 0, [`readAt.${caller.uid}`]: Timestamp.now() });
    await bumpChannel(`chat:${chatId}`);
    if (hadUnread) await bumpUserSignal(caller.uid, { topic: "dm" });
    return NextResponse.json({ ok: true, data: {} });
  } catch (error) {
    return handleAuthError(error);
  }
}
