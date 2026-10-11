import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { z } from "zod";

export const runtime = "nodejs";

const patchReportSchema = z.object({
  status: z.enum(["pending", "investigating", "resolved", "dismissed"]).optional(),
  adminNotes: z.string().max(1000).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const caller = await requireUser(req, ["admin"]);
    const { id } = await params;

    const body = await req.json();
    const parsed = patchReportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: "Invalid patch payload" } },
        { status: 400 }
      );
    }

    const reportRef = adminDb().collection("bugReports").doc(id);
    const snap = await reportRef.get();

    if (!snap.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Report not found" } },
        { status: 404 }
      );
    }

    const updates: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
      resolvedByUid: caller.uid,
    };

    if (parsed.data.status) {
      updates.status = parsed.data.status;
    }
    if (parsed.data.adminNotes !== undefined) {
      updates.adminNotes = parsed.data.adminNotes;
    }

    await reportRef.update(updates);

    // Audit log
    await adminDb().collection("auditLogs").add({
      actorUid: caller.uid,
      action: "report.updated",
      targetType: "bugReport",
      targetId: id,
      details: parsed.data,
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({
      ok: true,
      data: {
        id,
        ...updates,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
