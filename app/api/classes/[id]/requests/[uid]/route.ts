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

    // References for transaction
    const classRef = adminDb().collection("classes").doc(id);
    const enrollmentDocId = `${id}_${uid}`;
    const enrollmentRef = adminDb().collection("enrollments").doc(enrollmentDocId);

    const result = await adminDb().runTransaction(async (t) => {
      const classDoc = await t.get(classRef);
      if (!classDoc.exists) {
        const err = new Error("Class not found");
        (err as { code?: string; status?: number }).code = "NOT_FOUND";
        (err as { code?: string; status?: number }).status = 404;
        throw err;
      }

      const classData = classDoc.data()!;
      const isCoTeacher = Array.isArray(classData.coTeacherIds) && classData.coTeacherIds.includes(caller.uid);
      const isAuthorized = classData.teacherId === caller.uid || isCoTeacher || caller.role === "admin";
      if (!isAuthorized) {
        const err = new Error("Not authorized to manage this class");
        (err as { code?: string; status?: number }).code = "FORBIDDEN";
        (err as { code?: string; status?: number }).status = 403;
        throw err;
      }

      const enrollmentDoc = await t.get(enrollmentRef);
      if (!enrollmentDoc.exists) {
        const err = new Error("Enrollment request not found");
        (err as { code?: string; status?: number }).code = "NOT_FOUND";
        (err as { code?: string; status?: number }).status = 404;
        throw err;
      }

      const currentStatus = enrollmentDoc.data()?.status;
      const newStatus = decision === "approve" ? "active" : "rejected";

      t.update(enrollmentRef, {
        status: newStatus,
        updatedAt: Timestamp.now(),
      });

      if (decision === "approve" && currentStatus !== "active") {
        t.update(classRef, {
          studentCount: FieldValue.increment(1),
          updatedAt: Timestamp.now(),
        });
      }

      return { status: newStatus, decision };
    });

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
