import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { loadNotebook, touch, LIMITS } from "@/lib/notebooks/store";
import { areFriends, postSystemMessage } from "@/lib/chat/store";
import { notify } from "@/lib/notifications/server";
import { getPublicProfiles } from "@/lib/social/profile";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  uid: z.string().min(1),
  role: z.enum(["editor", "viewer", "remove"]),
});

/**
 * Owner shares the notebook with a friend (or changes/removes access). The first share creates the
 * notebook's group room in Messages; members are kept in sync with it.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ notebookId: string }> }) {
  try {
    const { notebookId } = await params;
    const caller = await requireUser(req);
    const { uid, role } = await parseJson(req, schema);
    const { ref, nb } = await loadNotebook(notebookId, caller.uid, "owner");
    if (uid === caller.uid) throw new ApiError(400, "SELF", "You already own this notebook.");
    const isMember = (nb.memberIds || []).includes(uid);

    if (role === "remove") {
      if (isMember) {
        await ref.update({ memberIds: FieldValue.arrayRemove(uid), [`roles.${uid}`]: FieldValue.delete() });
        if (nb.chatId) await adminDb().collection("chats").doc(nb.chatId).update({ memberIds: FieldValue.arrayRemove(uid) }).catch(() => null);
      }
      await touch(notebookId);
      return NextResponse.json({ ok: true, data: {} });
    }

    if (!isMember) {
      if (!(await areFriends(caller.uid, uid))) throw new ApiError(403, "FORBIDDEN", "You can only share with friends.");
      if ((nb.memberIds || []).length >= LIMITS.members) throw new ApiError(409, "LIMIT", `Up to ${LIMITS.members} people per notebook.`);
    }
    await ref.update({ memberIds: FieldValue.arrayUnion(uid), [`roles.${uid}`]: role });

    // The notebook's room: a group chat linked to it
    let chatId: string | null = nb.chatId || null;
    const profiles = await getPublicProfiles([caller.uid, uid]);
    if (!chatId) {
      const chatRef = adminDb().collection("chats").doc();
      chatId = chatRef.id;
      const members = Array.from(new Set([...(nb.memberIds || []), uid]));
      await chatRef.set({
        id: chatId,
        type: "group",
        name: `📓 ${nb.title}`,
        notebookId,
        memberIds: members,
        adminIds: [caller.uid],
        createdBy: caller.uid,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        lastMessage: null,
        unread: Object.fromEntries(members.map((m: string) => [m, 0])),
      });
      await ref.update({ chatId });
      await postSystemMessage(chatId, `Study room for the notebook “${nb.title}”`);
    } else if (!isMember) {
      await adminDb().collection("chats").doc(chatId).update({ memberIds: FieldValue.arrayUnion(uid), [`unread.${uid}`]: 0 }).catch(() => null);
      await postSystemMessage(chatId, `${profiles.get(caller.uid)?.displayName || "Someone"} added ${profiles.get(uid)?.displayName || "a friend"}`);
    }

    if (!isMember) {
      await notify(uid, {
        type: "friend",
        title: `${profiles.get(caller.uid)?.displayName || "A friend"} shared a notebook with you`,
        body: `“${nb.title}” · you can ${role === "editor" ? "edit" : "view"}`,
        href: `/notebook?nb=${notebookId}`,
        icon: "📓",
        actorUid: caller.uid,
      });
    }
    await touch(notebookId);
    return NextResponse.json({ ok: true, data: { chatId } });
  } catch (error) {
    return handleAuthError(error);
  }
}
