import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { isLate, isSessionOpen, normalizeCode } from "@/lib/attendance/logic";
import { studentClassIds } from "@/lib/teach/roster";

export const runtime = "nodejs";

const Body = z.object({ code: z.string().min(1).max(20) });

/** Student enters the code (or opens a link containing it). Guessing is rate-limited per user and per IP. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    // Every attempt counts, successful or not.
    const limits = await Promise.all([
      checkRateLimit(req, { uid: caller.uid, keyPrefix: "att-checkin-min", limit: 6, windowMs: 60_000 }),
      checkRateLimit(req, { uid: caller.uid, keyPrefix: "att-checkin-hour", limit: 30, windowMs: 60 * 60_000 }),
      checkRateLimit(req, { keyPrefix: "att-checkin-ip", limit: 60, windowMs: 60_000 }),
    ]);
    const blocked = limits.find(Boolean);
    if (blocked) return blocked;

    const { code: raw } = await parseJson(req, Body);
    const code = normalizeCode(raw);
    const invalid = new ApiError(404, "INVALID_CODE", "That code is not valid or has expired.");
    if (!code) throw invalid;

    const snap = await adminDb().collection("attendanceSessions").where("code", "==", code).limit(20).get();
    const now = Date.now();
    const myClasses = new Set(await studentClassIds(caller.uid));
    // Same message for wrong code, expired code, or a class you are not in: nothing to probe.
    const match = snap.docs.map((d) => d.data()).find((s) => isSessionOpen(s as never, now) && myClasses.has(s.classId));
    if (!match) throw invalid;

    const ref = adminDb().collection("attendanceCheckins").doc(`${match.id}_${caller.uid}`);
    const existing = await ref.get();
    if (existing.exists) {
      return NextResponse.json({ ok: true, data: { alreadyCheckedIn: true, classId: match.classId } });
    }
    const late = isLate(match as never, now);
    await ref.set({ sessionId: match.id, classId: match.classId, uid: caller.uid, at: now, late });
    return NextResponse.json({ ok: true, data: { alreadyCheckedIn: false, late, classId: match.classId } });
  } catch (error) {
    return handleAuthError(error);
  }
}
