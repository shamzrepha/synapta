import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status");

    let query = adminDb()
      .collection("bugReports")
      .orderBy("createdAt", "desc")
      .limit(100);

    if (statusFilter && ["pending", "investigating", "resolved", "dismissed"].includes(statusFilter)) {
      query = query.where("status", "==", statusFilter);
    }

    const snap = await query.get();

    const reports = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        reporterUid: data.reporterUid,
        reporterName: data.reporterName || "Anonymous",
        targetType: data.targetType || "bug",
        targetId: data.targetId || null,
        classId: data.classId || null,
        kcId: data.kcId || null,
        reason: data.reason || "Unspecified",
        description: data.description || "",
        status: data.status || "pending",
        adminNotes: data.adminNotes || null,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : null,
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
