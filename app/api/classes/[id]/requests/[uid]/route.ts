import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { joinRequestDecisionSchema } from "@/lib/validation/classes";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; uid: string }> }
) {
  try {
    const { id, uid } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    const body = await req.json();
    const parsed = joinRequestDecisionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: "Decision must be approve or reject" } },
        { status: 400 }
      );
    }

    const { decision } = parsed.data;

    // Verify ownership of class
    const classRef = adminDb().collection("classes").doc(id);
    const classDoc = await classRef.get();
    if (!classDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Class not found" } },
        { status: 404 }
      );
    }

    const classData = classDoc.data()!;
    if (classData.teacherId !== caller.uid && caller.role !== "admin") {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Not authorized to manage this class" } },
        { status: 403 }
      );
    }

    const enrollmentDocId = `${id}_${uid}`;
    const enrollmentRef = adminDb().collection("enrollments").doc(enrollmentDocId);
    const enrollmentDoc = await enrollmentRef.get();

    if (!enrollmentDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Enrollment request not found" } },
        { status: 404 }
      );
    }

    const newStatus = decision === "approve" ? "active" : "rejected";

    await enrollmentRef.update({
      status: newStatus,
      updatedAt: Timestamp.now(),
    });

    if (decision === "approve") {
      await classRef.update({
        studentCount: FieldValue.increment(1),
        updatedAt: Timestamp.now(),
      });
    }

    return NextResponse.json({
      ok: true,
      data: { status: newStatus, decision },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
