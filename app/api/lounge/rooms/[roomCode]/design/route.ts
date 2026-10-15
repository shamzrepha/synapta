import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { bumpChannel } from "@/lib/live/server";
import { createDesign } from "@/lib/studio/store";
import { getTemplate, templateStart } from "@/lib/studio/templates";
import { emptySpec, designKinds } from "@/lib/studio/spec";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.discriminatedUnion("from", [
  z.object({ from: z.literal("template"), templateId: z.string().max(60) }),
  z.object({ from: z.literal("blank"), kind: z.enum(designKinds) }),
  z.object({ from: z.literal("mine"), designId: z.string().max(80) }),
]);

/**
 * Starts (or attaches) the room's shared design — its "maker space". Everyone currently in the room
 * can edit it; every save is credited to the person who made it, so History shows who did what.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ roomCode: string }> }) {
  try {
    const { roomCode } = await params;
    const caller = await requireUser(req);
    const body = await parseJson(req, schema);
    const roomRef = adminDb().collection("rooms").doc(roomCode);
    const room = await roomRef.get();
    if (!room.exists) throw new ApiError(404, "NOT_FOUND", "Room not found");
    const r = room.data()!;
    if (!(r.memberIds || []).includes(caller.uid)) throw new ApiError(403, "FORBIDDEN", "Join the room first.");
    if (r.designId) throw new ApiError(409, "EXISTS", "This room already has a shared design.");

    let designId: string;
    if (body.from === "mine") {
      const d = await adminDb().collection("designs").doc(body.designId).get();
      if (!d.exists || d.data()!.ownerUid !== caller.uid) throw new ApiError(403, "FORBIDDEN", "Pick one of your own designs.");
      await d.ref.update({ roomCode, updatedAt: Timestamp.now() });
      designId = d.id;
    } else {
      const spec = body.from === "template" ? (() => {
        const t = getTemplate(body.templateId);
        if (!t) throw new ApiError(404, "NOT_FOUND", "Template not found");
        return templateStart(t, true);
      })() : emptySpec(body.kind);
      designId = await createDesign({
        user: caller,
        title: `${r.title || "Study room"} — shared design`.slice(0, 80),
        spec,
        source: body.from === "template" ? "template" : "create",
        message: `Started in room ${roomCode}`,
        visibility: r.classId ? "class" : "private",
        classId: r.classId || null,
        kcId: r.kcId || null,
        templateId: body.from === "template" ? body.templateId : null,
      });
      await adminDb().collection("designs").doc(designId).update({ roomCode });
    }
    await roomRef.update({ designId, updatedAt: Timestamp.now() });
    await roomRef.collection("messages").add({ uid: "system", displayName: "Sunroot Lounge", text: `🛠️ A shared design was started — open Maker space to build it together.`, createdAt: Timestamp.now() });
    await bumpChannel(`room:${roomCode}`);
    return NextResponse.json({ ok: true, data: { designId } });
  } catch (error) {
    return handleAuthError(error);
  }
}
