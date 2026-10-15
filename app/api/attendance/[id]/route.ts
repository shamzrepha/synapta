import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";

export const runtime = "nodejs";

/** Closes a check-in early (teacher of that class only). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    const ref = adminDb().collection("attendanceSessions").doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Check-in not found");
    await assertClassAccess(caller, snap.data()!.classId, "mutate");
    await ref.update({ closed: true });
    return NextResponse.json({ ok: true, data: { id, closed: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
