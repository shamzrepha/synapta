import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { ensureDirectChat, createGroupChat } from "@/lib/chat/store";
import { getPublicProfiles } from "@/lib/social/profile";
import { checkRateLimit } from "@/lib/rateLimit";
import { z } from "zod";

export const runtime = "nodejs";

/** Inbox: the caller's conversations, newest first, with unread counts. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const snap = await adminDb().collection("chats").where("memberIds", "array-contains", caller.uid).orderBy("updatedAt", "desc").limit(60).get();
    const otherUids = new Set<string>();
    snap.docs.forEach((d) => {
      const c = d.data();
      if (c.type === "direct") (c.memberIds as string[]).forEach((m) => m !== caller.uid && otherUids.add(m));
    });
    const profiles = await getPublicProfiles(Array.from(otherUids));
    let unreadTotal = 0;
    const chats = snap.docs.map((d) => {
      const c = d.data();
      const unread = Math.max(0, c.unread?.[caller.uid] || 0);
      unreadTotal += unread;
      const other = c.type === "direct" ? profiles.get((c.memberIds as string[]).find((m) => m !== caller.uid) || "") : null;
      return {
        id: d.id,
        type: c.type,
        name: c.type === "group" ? c.name : other?.displayName || "Friend",
        photoURL: other?.photoURL || null,
        otherUid: other?.uid || null,
        memberCount: (c.memberIds as string[]).length,
        lastMessage: c.lastMessage
          ? { text: c.lastMessage.text, senderUid: c.lastMessage.senderUid, senderName: c.lastMessage.senderName, at: c.lastMessage.at?.toDate?.().toISOString() || null }
          : null,
        unread,
        updatedAt: c.updatedAt?.toDate?.().toISOString() || null,
      };
    });
    return NextResponse.json({ ok: true, data: { chats, unreadTotal } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const createSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("direct"), uid: z.string().min(1) }),
  z.object({ type: z.literal("group"), name: z.string().trim().min(1).max(60), memberUids: z.array(z.string()).min(1).max(49) }),
]);

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "chat_create", limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, createSchema);
    const id = body.type === "direct" ? await ensureDirectChat(caller.uid, body.uid) : await createGroupChat(caller.uid, body.name, body.memberUids);
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
