import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const reportSchema = z.object({
  targetType: z.enum(["bug", "class", "kc", "ai_content", "user"]),
  targetId: z.string().optional(),
  classId: z.string().optional(),
  kcId: z.string().optional(),
  reason: z.string().min(2, "Reason required").max(120),
  description: z.string().min(5, "Description must be at least 5 characters").max(2000),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);

    const rateLimitRes = await checkRateLimit(req, {
      keyPrefix: "reports",
      limit: 10,
      windowMs: 3600_000, // 1 hour
      uid: caller.uid,
    });
    if (rateLimitRes) return rateLimitRes;

    const body = await req.json();
    const parsed = reportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Invalid report payload" } },
        { status: 400 }
      );
    }

    const { targetType, targetId, classId, kcId, reason, description } = parsed.data;

    const callerDoc = await adminDb().collection("users").doc(caller.uid).get();
    const reporterName = callerDoc.data()?.displayName || "User";

    const reportRef = adminDb().collection("bugReports").doc();
    const now = Timestamp.now();

    const reportDoc = {
      id: reportRef.id,
      reporterUid: caller.uid,
      reporterName,
      targetType,
      targetId: targetId || null,
      classId: classId || null,
      kcId: kcId || null,
      reason,
      description,
      status: "pending", // pending | investigating | resolved | dismissed
      adminNotes: null,
      createdAt: now,
      updatedAt: now,
    };

    await reportRef.set(reportDoc);

    // Write audit log entry
    await adminDb().collection("auditLogs").add({
      actorUid: caller.uid,
      actorName: reporterName,
      action: "report.created",
      targetType,
      targetId: targetId || reportRef.id,
      details: { reason, targetType },
      createdAt: now,
    });

    return NextResponse.json({
      ok: true,
      data: {
        id: reportRef.id,
        status: "pending",
        message: "Report submitted successfully. Our safety and engineering team will review it shortly.",
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
