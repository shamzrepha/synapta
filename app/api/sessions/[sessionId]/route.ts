import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { getClassAccess } from "@/lib/auth/classAccess";
import { ApiError } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { bumpChannel } from "@/lib/live/server";

export const runtime = "nodejs";

/** Host or class teacher cancels a session. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await params;
    const caller = await requireUser(req);
    const ref = adminDb().collection("studySessions").doc(sessionId);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Session not found");
    const s = snap.data()!;
    const access = await getClassAccess(caller, s.classId);
    if (s.hostUid !== caller.uid && !access.canMutate) throw new ApiError(403, "FORBIDDEN", "Only the host or teacher can cancel.");
    await ref.delete();
    await bumpChannel(`sessions:class:${s.classId}`);
    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
