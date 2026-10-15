import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { Timestamp } from "@/lib/firebase/admin";
import { loadChatForMember } from "@/lib/chat/store";
import { bumpChannel } from "@/lib/live/server";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

/** "X is typing…" (clients call at most every few seconds while typing). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "chat_typing", limit: 30, windowMs: 60_000 });
    if (limited) return limited;
    const { ref } = await loadChatForMember(chatId, caller.uid);
    await ref.update({ [`typing.${caller.uid}`]: Timestamp.now() });
    await bumpChannel(`chat:${chatId}`);
    return NextResponse.json({ ok: true, data: {} });
  } catch (error) {
    return handleAuthError(error);
  }
}
