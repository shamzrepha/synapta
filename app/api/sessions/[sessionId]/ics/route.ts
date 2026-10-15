import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { getClassAccess } from "@/lib/auth/classAccess";
import { ApiError } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { buildIcs } from "@/lib/sessions/ics";

export const runtime = "nodejs";

/** "Add to calendar": downloads a .ics file for the session. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await params;
    const caller = await requireUser(req);
    const snap = await adminDb().collection("studySessions").doc(sessionId).get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Session not found");
    const s = snap.data()!;
    const access = await getClassAccess(caller, s.classId);
    if (!access.isEnrolled && !access.canMutate) throw new ApiError(403, "FORBIDDEN", "Join the class first.");
    const ics = buildIcs({
      id: snap.id,
      title: s.title,
      description: s.description || "",
      startAt: s.startAt.toDate(),
      endAt: s.endAt.toDate(),
      url: `${req.nextUrl.origin}/sessions?focus=${snap.id}`,
    });
    return new NextResponse(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="study-session-${snap.id}.ics"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
