import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import { activeStudentUids, displayNames } from "@/lib/teach/roster";
import { readStats } from "@/lib/announcements/logic";

export const runtime = "nodejs";

/** Who has read an announcement (teachers of that class only). Names only, never emails. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    const snap = await adminDb().collection("classAnnouncements").doc(id).get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Announcement not found");
    const access = await assertClassAccess(caller, snap.data()!.classId, "mutate");

    const [students, readsSnap] = await Promise.all([
      activeStudentUids(snap.data()!.classId, access.classData),
      adminDb().collection("announcementReads").where("announcementId", "==", id).limit(2000).get(),
    ]);
    const readAt = new Map(readsSnap.docs.map((d) => [d.data().uid as string, d.data().at as string]));
    const names = await displayNames(students);
    const stats = readStats(Array.from(readAt.keys()), students);
    const people = students
      .map((uid) => ({ uid, name: names.get(uid) || "Student", readAt: readAt.get(uid) || null }))
      .sort((a, b) => Number(!!b.readAt) - Number(!!a.readAt) || a.name.localeCompare(b.name));
    return NextResponse.json({ ok: true, data: { ...stats, people } });
  } catch (error) {
    return handleAuthError(error);
  }
}
