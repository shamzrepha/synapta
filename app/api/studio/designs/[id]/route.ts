import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { bumpChannel } from "@/lib/live/server";
import { loadDesign, serializeDesign } from "@/lib/studio/store";
import { getPublicProfiles } from "@/lib/social/profile";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const { ref, data, canEdit, isOwner } = await loadDesign(id, caller);
    const [star, profiles] = await Promise.all([ref.collection("stars").doc(caller.uid).get(), getPublicProfiles(data.memberIds || [])]);
    return NextResponse.json({
      ok: true,
      data: {
        design: serializeDesign(id, data),
        spec: data.spec,
        canEdit,
        isOwner,
        starred: star.exists,
        members: (data.memberIds || []).map((uid: string) => ({ uid, displayName: profiles.get(uid)?.displayName || "Maker", photoURL: profiles.get(uid)?.photoURL || null, owner: uid === data.ownerUid })),
        myProgress: (data.progress || {})[caller.uid] || {},
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  visibility: z.enum(["private", "public", "class"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const body = await parseJson(req, patchSchema);
    const { ref, data } = await loadDesign(id, caller, body.visibility ? "owner" : "edit");
    const update: Record<string, unknown> = { updatedAt: Timestamp.now() };
    if (body.title) update.title = body.title;
    if (body.visibility) update.visibility = body.visibility === "class" && !data.classId ? "private" : body.visibility;
    await ref.update(update);
    await bumpChannel(`design:${id}`);
    return NextResponse.json({ ok: true, data: {} });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const { ref } = await loadDesign(id, caller, "owner");
    await adminDb().recursiveDelete(ref);
    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
