import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import { bumpChannel, bumpUserSignal } from "@/lib/live/server";
import { getPublicProfiles } from "@/lib/social/profile";
import { sendPush } from "@/lib/notifications/push";
import { z } from "zod";

/**
 * Conversations (direct + group). One `chats/{chatId}` doc per conversation with members, last
 * message, per-member unread counts, read times and typing timestamps; messages in a subcollection.
 * Live updates use the `chat:{id}` channel; inbox badges use each member's user signal.
 */

export const MAX_GROUP_MEMBERS = 50;
export const MESSAGE_REACTIONS = ["👍", "❤️", "😂", "😮", "🎉", "🙏"] as const;

export const attachmentSchema = z.object({
  type: z.enum(["post", "room", "event", "notebook", "badge", "topic", "session", "profile", "class", "design"]),
  id: z.string().max(200),
  title: z.string().max(200),
  subtitle: z.string().max(300).optional().default(""),
  href: z.string().regex(/^\/[^\s]*$/, "Internal links only").max(300),
  emoji: z.string().max(8).optional(),
});
export type Attachment = z.input<typeof attachmentSchema>;

export function directChatId(a: string, b: string): string {
  return `dm_${[a, b].sort().join("_")}`;
}

export function chatRef(chatId: string) {
  return adminDb().collection("chats").doc(chatId);
}

export async function areFriends(a: string, b: string): Promise<boolean> {
  return (await adminDb().collection("users").doc(a).collection("friends").doc(b).get()).exists;
}

export async function loadChatForMember(chatId: string, uid: string) {
  const snap = await chatRef(chatId).get();
  if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Conversation not found");
  const chat = snap.data()!;
  if (!Array.isArray(chat.memberIds) || !chat.memberIds.includes(uid)) {
    throw new ApiError(403, "FORBIDDEN", "You're not in this conversation.");
  }
  return { ref: snap.ref, chat };
}

/** Opens (or creates) the 1:1 chat with a friend, importing the old friend-DM history once. */
export async function ensureDirectChat(uid: string, otherUid: string): Promise<string> {
  if (uid === otherUid) throw new ApiError(400, "VALIDATION", "You can't message yourself.");
  if (!(await areFriends(uid, otherUid))) throw new ApiError(403, "FORBIDDEN", "You can only message friends. Send a friend request first.");
  const id = directChatId(uid, otherUid);
  const ref = chatRef(id);
  const snap = await ref.get();
  if (snap.exists) return id;

  await ref.set({
    id,
    type: "direct",
    memberIds: [uid, otherUid].sort(),
    name: null,
    createdBy: uid,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    lastMessage: null,
    unread: { [uid]: 0, [otherUid]: 0 },
  });
  // One-time import of the legacy friend chat
  const legacy = await adminDb().collection("direct_chats").doc([uid, otherUid].sort().join("_")).collection("messages").orderBy("createdAt", "asc").limit(200).get().catch(() => null);
  if (legacy && !legacy.empty) {
    const batch = adminDb().batch();
    legacy.docs.forEach((d) => {
      const m = d.data();
      batch.set(ref.collection("messages").doc(d.id), {
        senderUid: m.senderUid,
        senderName: m.senderName || "Learner",
        text: m.text || "",
        attachment: null,
        reactions: {},
        createdAt: m.createdAt || Timestamp.now(),
      });
    });
    const last = legacy.docs[legacy.docs.length - 1].data();
    batch.update(ref, {
      lastMessage: { text: last.text || "", senderUid: last.senderUid, senderName: last.senderName || "", at: last.createdAt || Timestamp.now() },
      updatedAt: last.createdAt || Timestamp.now(),
    });
    await batch.commit();
  }
  return id;
}

export async function createGroupChat(uid: string, name: string, memberUids: string[]): Promise<string> {
  const others = Array.from(new Set(memberUids.filter((m) => m && m !== uid)));
  if (others.length < 1) throw new ApiError(400, "VALIDATION", "Add at least one friend.");
  if (others.length + 1 > MAX_GROUP_MEMBERS) throw new ApiError(400, "VALIDATION", `Groups can have up to ${MAX_GROUP_MEMBERS} people.`);
  const friendChecks = await Promise.all(others.map((o) => areFriends(uid, o)));
  if (friendChecks.some((f) => !f)) throw new ApiError(403, "FORBIDDEN", "You can only add your friends to a group.");
  const ref = adminDb().collection("chats").doc();
  const members = [uid, ...others];
  await ref.set({
    id: ref.id,
    type: "group",
    memberIds: members,
    adminIds: [uid],
    name: name.trim().slice(0, 60),
    createdBy: uid,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    lastMessage: null,
    unread: Object.fromEntries(members.map((m) => [m, 0])),
  });
  await postSystemMessage(ref.id, `Group created`);
  return ref.id;
}

export async function postSystemMessage(chatId: string, text: string): Promise<void> {
  await chatRef(chatId).collection("messages").add({ senderUid: "system", senderName: "", text, attachment: null, reactions: {}, createdAt: Timestamp.now() });
}

export async function sendMessage(params: { chatId: string; uid: string; text: string; attachment?: Attachment | null }) {
  const { ref, chat } = await loadChatForMember(params.chatId, params.uid);
  if (chat.type === "direct") {
    const other = (chat.memberIds as string[]).find((m) => m !== params.uid)!;
    if (!(await areFriends(params.uid, other))) throw new ApiError(403, "FORBIDDEN", "You're no longer friends with this person.");
  }
  const me = (await getPublicProfiles([params.uid])).get(params.uid);
  const msgRef = ref.collection("messages").doc();
  const now = Timestamp.now();
  const preview = params.text || (params.attachment ? `Shared: ${params.attachment.title}` : "");
  const unreadUpdates: Record<string, unknown> = {};
  for (const m of chat.memberIds as string[]) {
    if (m !== params.uid) unreadUpdates[`unread.${m}`] = FieldValue.increment(1);
  }
  const batch = adminDb().batch();
  batch.set(msgRef, {
    senderUid: params.uid,
    senderName: me?.displayName || "Learner",
    senderPhoto: me?.photoURL || null,
    text: params.text,
    attachment: params.attachment || null,
    reactions: {},
    createdAt: now,
  });
  batch.update(ref, {
    ...unreadUpdates,
    [`typing.${params.uid}`]: FieldValue.delete(),
    [`readAt.${params.uid}`]: now,
    lastMessage: { text: preview.slice(0, 160), senderUid: params.uid, senderName: me?.displayName || "", at: now },
    updatedAt: now,
  });
  await batch.commit();
  await bumpChannel(`chat:${params.chatId}`);
  const others = (chat.memberIds as string[]).filter((m) => m !== params.uid);
  await Promise.all(others.map((m) => bumpUserSignal(m, { topic: "dm" })));
  await Promise.all(
    others.map((m) =>
      sendPush(m, {
        title: chat.type === "group" ? `${me?.displayName || "Someone"} in ${chat.name}` : me?.displayName || "New message",
        body: preview.slice(0, 140),
        href: `/messages?chat=${params.chatId}`,
        tag: `chat-${params.chatId}`,
      })
    )
  );
  return { id: msgRef.id };
}
