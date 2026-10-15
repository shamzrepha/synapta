import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";

export const runtime = "nodejs";

/** Records that the signed-in member has read an announcement (idempotent; keeps the first read time). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const snap = await adminDb().collection("classAnnouncements").doc(id).get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Announcement not found");
    await assertClassAccess(caller, snap.data()!.classId, "view");
    const ref = adminDb().collection("announcementReads").doc(`${id}_${caller.uid}`);
    try {
      await ref.create({ announcementId: id, classId: snap.data()!.classId, uid: caller.uid, at: new Date().toISOString() });
    } catch {
      // already read
    }
    return NextResponse.json({ ok: true, data: { id, read: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
