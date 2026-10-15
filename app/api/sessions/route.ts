import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { getActiveStudentUids, getMyClassIds } from "@/lib/classes/members";
import { notifyMany } from "@/lib/notifications/server";
import { bumpChannel } from "@/lib/live/server";
import { serializeSession, sendDueReminders } from "@/lib/sessions/store";
import { z } from "zod";

export const runtime = "nodejs";

/** Sessions for one class (?classId=) or all of the caller's classes: live, upcoming, and the last week. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const classId = req.nextUrl.searchParams.get("classId");
    let classIds: string[];
    if (classId) {
      await assertClassAccess(caller, classId, "view");
      classIds = [classId];
    } else {
      classIds = (await getMyClassIds(caller.uid)).slice(0, 15);
    }
    await sendDueReminders(classIds).catch(() => 0);

    const since = Timestamp.fromMillis(Date.now() - 7 * 24 * 3600 * 1000);
    const snaps = await Promise.all(
      classIds.map((cid) =>
        adminDb().collection("studySessions").where("classId", "==", cid).where("startAt", ">=", since).orderBy("startAt", "asc").limit(30).get()
      )
    );
    const order = { live: 0, starting_soon: 1, upcoming: 2, ended: 3 } as const;
    const sessions = snaps
      .flatMap((s) => s.docs.map((d) => serializeSession(d.id, d.data(), caller.uid)))
      .sort((a, b) =>
        order[a.status] - order[b.status] ||
        (a.status === "ended"
          ? new Date(b.startAt).getTime() - new Date(a.startAt).getTime()
          : new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
      );
    return NextResponse.json({
      ok: true,
      data: { sessions, channels: classIds.map((c) => `sessions:class:${c}`) },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

const createSchema = z.object({
  classId: z.string().min(1),
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().max(1500).optional().default(""),
  startAt: z.string().datetime(),
  durationMin: z.number().int().min(15).max(240),
});

function roomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

/** Teachers schedule class sessions; enrolled students can schedule study groups too. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "session_create", limit: 5, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, createSchema);
    const access = await assertClassAccess(caller, body.classId, "view");
    if (!access.canMutate && !access.isEnrolled) throw new ApiError(403, "FORBIDDEN", "Join the class to schedule a session.");

    const startAt = new Date(body.startAt);
    if (startAt.getTime() < Date.now() - 60 * 1000) throw new ApiError(400, "VALIDATION", "Start time is in the past.");
    const endAt = new Date(startAt.getTime() + body.durationMin * 60 * 1000);
    const host = await adminDb().collection("users").doc(caller.uid).get();
    const hostName = host.data()?.displayName || "Someone";
    const classTitle = access.classData.title || "Class";

    // A dedicated study room (chat + shared scratchpad) for the session
    let code = roomCode();
    for (let i = 0; i < 5 && (await adminDb().collection("rooms").doc(code).get()).exists; i++) code = roomCode();
    await adminDb().collection("rooms").doc(code).set({
      title: body.title,
      classId: body.classId,
      kcId: null,
      kcTitle: null,
      hostId: caller.uid,
      hostName,
      memberIds: [caller.uid],
      participants: [{ uid: caller.uid, displayName: hostName, role: "host", joinedAt: new Date().toISOString() }],
      scratchpad: `# ${body.title}\n\n${body.description || ""}\n\n_Shared notes for this session — everyone can edit._`,
      sessionStartAt: Timestamp.fromDate(startAt),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    const ref = adminDb().collection("studySessions").doc();
    await ref.set({
      classId: body.classId,
      classTitle,
      title: body.title,
      description: body.description ?? "",
      hostUid: caller.uid,
      hostName,
      hostIsTeacher: access.canMutate,
      startAt: Timestamp.fromDate(startAt),
      endAt: Timestamp.fromDate(endAt),
      durationMin: body.durationMin,
      roomCode: code,
      rsvpUids: [caller.uid],
      attendeeUids: [],
      reminderSent: false,
      createdAt: Timestamp.now(),
    });

    const members = await getActiveStudentUids(body.classId);
    await notifyMany(
      members.filter((u) => u !== caller.uid),
      {
        type: "session_scheduled",
        title: `${access.canMutate ? "New class session" : "Study group"}: ${body.title}`,
        body: `${hostName} · ${startAt.toUTCString().replace(":00 GMT", " UTC")} · ${body.durationMin} min`,
        href: `/sessions?focus=${ref.id}`,
        icon: "📅",
      }
    );
    await bumpChannel(`sessions:class:${body.classId}`);
    return NextResponse.json({ ok: true, data: { id: ref.id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
