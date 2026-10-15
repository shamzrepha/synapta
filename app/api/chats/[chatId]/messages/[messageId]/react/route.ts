import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { loadChatForMember, MESSAGE_REACTIONS } from "@/lib/chat/store";
import { bumpChannel } from "@/lib/live/server";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({ emoji: z.enum(MESSAGE_REACTIONS) });

/** Toggles the caller's emoji on a message (several emojis per person allowed, like most chat apps). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ chatId: string; messageId: string }> }) {
  try {
    const { chatId, messageId } = await params;
    const caller = await requireUser(req);
    const { emoji } = await parseJson(req, schema);
    const { ref } = await loadChatForMember(chatId, caller.uid);
    const mRef = ref.collection("messages").doc(messageId);
    const reactions = await adminDb().runTransaction(async (t) => {
      const m = await t.get(mRef);
      if (!m.exists) throw new ApiError(404, "NOT_FOUND", "Message not found");
      const r = { ...((m.data()!.reactions || {}) as Record<string, string[]>) };
      const list = new Set(r[emoji] || []);
      if (list.has(caller.uid)) list.delete(caller.uid);
      else list.add(caller.uid);
      if (list.size) r[emoji] = Array.from(list);
      else delete r[emoji];
      t.update(mRef, { reactions: r });
      return r;
    });
    await bumpChannel(`chat:${chatId}`);
    return NextResponse.json({ ok: true, data: { reactions } });
  } catch (error) {
    return handleAuthError(error);
  }
}
