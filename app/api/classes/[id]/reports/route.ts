import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    await assertClassAccess(caller, id, "mutate");

    const snap = await adminDb()
      .collection("bugReports")
      .where("classId", "==", id)
      .limit(50)
      .get();

    const reports = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        reporterUid: data.reporterUid,
        reporterName: data.reporterName || "User",
        targetType: data.targetType,
        targetId: data.targetId || null,
        classId: data.classId,
        kcId: data.kcId || null,
        reason: data.reason,
        description: data.description,
        status: data.status || "pending",
        adminNotes: data.adminNotes || null,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
      };
    });

    return NextResponse.json({
      ok: true,
      data: { reports },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
