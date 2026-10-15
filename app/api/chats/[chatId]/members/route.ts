import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { FieldValue } from "@/lib/firebase/admin";
import { loadChatForMember, areFriends, postSystemMessage, MAX_GROUP_MEMBERS } from "@/lib/chat/store";
import { getPublicProfiles } from "@/lib/social/profile";
import { bumpChannel } from "@/lib/live/server";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), uids: z.array(z.string()).min(1).max(20) }),
  z.object({ action: z.literal("leave") }),
  z.object({ action: z.literal("rename"), name: z.string().trim().min(1).max(60) }),
]);

/** Group management: add friends, leave, rename. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await params;
    const caller = await requireUser(req);
    const body = await parseJson(req, schema);
    const { ref, chat } = await loadChatForMember(chatId, caller.uid);
    if (chat.type !== "group") throw new ApiError(400, "NOT_GROUP", "Only group chats can be changed.");
    const me = (await getPublicProfiles([caller.uid])).get(caller.uid)?.displayName || "Someone";

    if (body.action === "add") {
      const fresh = body.uids.filter((u) => !(chat.memberIds as string[]).includes(u));
      if ((chat.memberIds as string[]).length + fresh.length > MAX_GROUP_MEMBERS) throw new ApiError(400, "FULL", "This group is full.");
      const checks = await Promise.all(fresh.map((u) => areFriends(caller.uid, u)));
      if (checks.some((c) => !c)) throw new ApiError(403, "FORBIDDEN", "You can only add your friends.");
      if (fresh.length) {
        await ref.update({ memberIds: FieldValue.arrayUnion(...fresh), ...Object.fromEntries(fresh.map((u) => [`unread.${u}`, 0])) });
        const names = await getPublicProfiles(fresh);
        await postSystemMessage(chatId, `${me} added ${fresh.map((u) => names.get(u)?.displayName || "someone").join(", ")}`);
      }
    } else if (body.action === "leave") {
      await ref.update({ memberIds: FieldValue.arrayRemove(caller.uid), adminIds: FieldValue.arrayRemove(caller.uid) });
      await postSystemMessage(chatId, `${me} left the group`);
    } else {
      await ref.update({ name: body.name });
      await postSystemMessage(chatId, `${me} renamed the group to “${body.name}”`);
    }
    await bumpChannel(`chat:${chatId}`);
    return NextResponse.json({ ok: true, data: {} });
  } catch (error) {
    return handleAuthError(error);
  }
}
