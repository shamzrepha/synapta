import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { clampMinutes, generateCode, DEFAULT_LATE_AFTER_MIN, DEFAULT_MINUTES } from "@/lib/attendance/logic";

export const runtime = "nodejs";

/** Teacher: recent check-in sessions of a class with attendee counts. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req, ["teacher", "admin"]);
    const classId = new URL(req.url).searchParams.get("classId");
    if (!classId) throw new ApiError(400, "VALIDATION", "classId is required");
    await assertClassAccess(caller, classId, "mutate");
    const [sessSnap, checkSnap] = await Promise.all([
      adminDb().collection("attendanceSessions").where("classId", "==", classId).limit(200).get(),
      adminDb().collection("attendanceCheckins").where("classId", "==", classId).limit(5000).get(),
    ]);
    const counts = new Map<string, number>();
    checkSnap.docs.forEach((d) => counts.set(d.data().sessionId, (counts.get(d.data().sessionId) || 0) + 1));
    const sessions = sessSnap.docs
      .map((d) => ({ ...(d.data() as { openedAt: number }), checkedIn: counts.get(d.id) || 0 }))
      .sort((a, b) => b.openedAt - a.openedAt);
    return NextResponse.json({ ok: true, data: sessions });
  } catch (error) {
    return handleAuthError(error);
  }
}

const Create = z.object({
  classId: z.string().min(1).max(128),
  minutes: z.number().optional(),
  lateAfterMin: z.number().optional(),
  title: z.string().trim().max(100).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req, ["teacher", "admin"]);
    const body = await parseJson(req, Create);
    await assertClassAccess(caller, body.classId, "mutate");

    const minutes = clampMinutes(body.minutes, 1, 240, DEFAULT_MINUTES);
    const lateAfterMin = clampMinutes(body.lateAfterMin, 0, minutes, DEFAULT_LATE_AFTER_MIN);
    const now = Date.now();

    // Pick a code not used by another still-open session.
    let code = generateCode();
    for (let i = 0; i < 5; i++) {
      const clash = await adminDb().collection("attendanceSessions").where("code", "==", code).limit(10).get();
      if (!clash.docs.some((d) => !d.data().closed && d.data().expiresAt > now)) break;
      code = generateCode();
    }

    const ref = adminDb().collection("attendanceSessions").doc();
    const session = {
      id: ref.id,
      classId: body.classId,
      teacherId: caller.uid,
      title: body.title || "",
      code,
      openedAt: now,
      expiresAt: now + minutes * 60_000,
      lateAfterMin,
      closed: false,
    };
    await ref.set(session);
    return NextResponse.json({ ok: true, data: { ...session, checkedIn: 0 } });
  } catch (error) {
    return handleAuthError(error);
  }
}
