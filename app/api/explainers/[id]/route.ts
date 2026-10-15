import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { deleteMedia } from "@/lib/media/store";

export const runtime = "nodejs";

/** Owners (and admins) can delete an explainer and its video. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireUser(req);
    const { id } = await params;
    const ref = adminDb().collection("explainers").doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Explainer not found.");
    const x = snap.data()!;
    if (x.ownerUid !== caller.uid && caller.role !== "admin") throw new ApiError(403, "FORBIDDEN", "You can only delete your own explainers.");
    await deleteMedia(String(x.videoPath));
    const likes = await ref.collection("likes").limit(500).get();
    const batch = adminDb().batch();
    likes.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(ref);
    await batch.commit();
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
