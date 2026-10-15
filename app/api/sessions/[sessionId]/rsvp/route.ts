import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { getClassAccess } from "@/lib/auth/classAccess";
import { ApiError } from "@/lib/api/errors";
import { adminDb, FieldValue } from "@/lib/firebase/admin";
import { bumpChannel } from "@/lib/live/server";

export const runtime = "nodejs";

/** Toggles "I'm going". */
export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await params;
    const caller = await requireUser(req);
    const ref = adminDb().collection("studySessions").doc(sessionId);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Session not found");
    const s = snap.data()!;
    const access = await getClassAccess(caller, s.classId);
    if (!access.isEnrolled && !access.canMutate) throw new ApiError(403, "FORBIDDEN", "Join the class first.");
    const going = Array.isArray(s.rsvpUids) && s.rsvpUids.includes(caller.uid);
    await ref.update({ rsvpUids: going ? FieldValue.arrayRemove(caller.uid) : FieldValue.arrayUnion(caller.uid) });
    await bumpChannel(`sessions:class:${s.classId}`);
    return NextResponse.json({ ok: true, data: { going: !going } });
  } catch (error) {
    return handleAuthError(error);
  }
}
