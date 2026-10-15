import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { Timestamp } from "@/lib/firebase/admin";
import { loadChatForMember } from "@/lib/chat/store";
import { getPublicProfiles } from "@/lib/social/profile";

export const runtime = "nodejs";

function iso(v: unknown): string | null {
  const t = v as { toDate?: () => Date } | undefined;
  return t?.toDate ? t.toDate().toISOString() : null;
}

/** Conversation details + latest messages (or older ones with ?before=ISO). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await params;
    const caller = await requireUser(req);
    const { ref, chat } = await loadChatForMember(chatId, caller.uid);
    const before = req.nextUrl.searchParams.get("before");
    let q = ref.collection("messages").orderBy("createdAt", "desc");
    if (before) q = q.startAfter(Timestamp.fromDate(new Date(before)));
    const snap = await q.limit(60).get();
    const members = await getPublicProfiles(chat.memberIds as string[]);
    const now = Date.now();
    const typing = Object.entries((chat.typing || {}) as Record<string, { toMillis?: () => number }>)
      .filter(([uid, at]) => uid !== caller.uid && at?.toMillis && now - at.toMillis() < 7000)
      .map(([uid]) => members.get(uid)?.displayName || "Someone");
    const readAt = Object.fromEntries(Object.entries((chat.readAt || {}) as Record<string, unknown>).map(([u, t]) => [u, iso(t)]));
    const other = chat.type === "direct" ? members.get((chat.memberIds as string[]).find((m) => m !== caller.uid) || "") : null;

    return NextResponse.json({
      ok: true,
      data: {
        chat: {
          id: chatId,
          type: chat.type,
          name: chat.type === "group" ? chat.name : other?.displayName || "Friend",
          photoURL: other?.photoURL || null,
          otherUid: other?.uid || null,
          otherUsername: other?.username || null,
          isAdmin: Array.isArray(chat.adminIds) && chat.adminIds.includes(caller.uid),
          members: (chat.memberIds as string[]).map((u) => ({
            uid: u,
            displayName: members.get(u)?.displayName || "Learner",
            photoURL: members.get(u)?.photoURL || null,
            level: members.get(u)?.level || 1,
          })),
        },
        messages: snap.docs
          .map((d) => {
            const m = d.data();
            return {
              id: d.id,
              senderUid: m.senderUid,
              senderName: m.senderName,
              senderPhoto: m.senderPhoto || null,
              text: m.text || "",
              attachment: m.attachment || null,
              reactions: m.reactions || {},
              createdAt: iso(m.createdAt),
            };
          })
          .reverse(),
        hasMore: snap.size === 60,
        typing,
        readAt,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
