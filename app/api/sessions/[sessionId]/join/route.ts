import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { getClassAccess } from "@/lib/auth/classAccess";
import { ApiError } from "@/lib/api/errors";
import { adminDb, FieldValue } from "@/lib/firebase/admin";
import { bumpChannel } from "@/lib/live/server";
import { trackProgress } from "@/lib/game/progress";
import { JOIN_EARLY_MS } from "@/lib/sessions/store";

export const runtime = "nodejs";

/** Records attendance and returns the session's study-room code (opens 10 minutes early). */
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
    const now = Date.now();
    if (now < s.startAt.toMillis() - JOIN_EARLY_MS) throw new ApiError(409, "TOO_EARLY", "The room opens 10 minutes before the start.");
    if (now > s.endAt.toMillis()) throw new ApiError(409, "ENDED", "This session has ended.");

    const firstTime = !(Array.isArray(s.attendeeUids) && s.attendeeUids.includes(caller.uid));
    if (firstTime) {
      await ref.update({ attendeeUids: FieldValue.arrayUnion(caller.uid) });
      await trackProgress({ uid: caller.uid, xpToAward: 15, stats: { sessionsJoined: 1 }, reason: "session_join" });
      await bumpChannel(`sessions:class:${s.classId}`);
    }
    return NextResponse.json({ ok: true, data: { roomCode: s.roomCode } });
  } catch (error) {
    return handleAuthError(error);
  }
}
