import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { FieldValue } from "@/lib/firebase/admin";
import { bumpChannel } from "@/lib/live/server";
import { areFriends } from "@/lib/chat/store";
import { notify } from "@/lib/notifications/server";
import { loadDesign } from "@/lib/studio/store";
import { z } from "zod";

export const runtime = "nodejs";

/** Owner adds/removes collaborators (friends) who can commit to the design. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const { uid, action } = await parseJson(req, z.object({ uid: z.string().min(1), action: z.enum(["add", "remove"]) }));
    const { ref, data } = await loadDesign(id, caller, "owner");
    if (uid === data.ownerUid) throw new ApiError(400, "SELF", "The owner is always a collaborator.");
    if (action === "add") {
      if (!(await areFriends(caller.uid, uid))) throw new ApiError(403, "FORBIDDEN", "You can only add friends as collaborators.");
      if ((data.memberIds || []).length >= 20) throw new ApiError(409, "LIMIT", "Up to 20 collaborators per design.");
      await ref.update({ memberIds: FieldValue.arrayUnion(uid) });
      await notify(uid, { type: "friend", title: "You were added to a design", body: `You can now edit “${data.title}” in Maker Studio`, href: `/studio/${id}`, icon: "🛠️", actorUid: caller.uid }).catch(() => null);
    } else {
      await ref.update({ memberIds: FieldValue.arrayRemove(uid) });
    }
    await bumpChannel(`design:${id}`);
    return NextResponse.json({ ok: true, data: {} });
  } catch (error) {
    return handleAuthError(error);
  }
}
