import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { z } from "zod";

export const runtime = "nodejs";

const patchReportSchema = z.object({
  status: z.enum(["investigating", "resolved", "dismissed", "escalated_to_admin"]),
  teacherNotes: z.string().max(1000).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; reportId: string }> }
) {
  try {
    const { id: classId, reportId } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    await assertClassAccess(caller, classId, "mutate");

    const body = await req.json();
    const parsed = patchReportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Invalid payload" } },
        { status: 400 }
      );
    }

    const { status, teacherNotes } = parsed.data;

    const reportRef = adminDb().collection("bugReports").doc(reportId);
    const reportDoc = await reportRef.get();

    if (!reportDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Report not found" } },
        { status: 404 }
      );
    }

    const reportData = reportDoc.data()!;
    if (reportData.classId !== classId) {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Report does not belong to this class" } },
        { status: 403 }
      );
    }

    const updates: Record<string, unknown> = {
      status,
      updatedAt: Timestamp.now(),
    };

    if (teacherNotes !== undefined) {
      updates.teacherNotes = teacherNotes;
    }

    if (status === "escalated_to_admin") {
      updates.escalatedAt = Timestamp.now();
      updates.escalatedBy = caller.uid;
    }

    await reportRef.update(updates);

    // Audit log
    await adminDb().collection("auditLogs").add({
      actorUid: caller.uid,
      action: status === "escalated_to_admin" ? "report.escalated_to_admin" : "report.teacher_triage",
      targetType: "bugReport",
      targetId: reportId,
      details: { classId, status, teacherNotes },
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({
      ok: true,
      data: { status, reportId },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
