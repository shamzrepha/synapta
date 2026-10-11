import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);

    const rateLimitRes = await checkRateLimit(req, {
      keyPrefix: "class_join",
      limit: 10,
      windowMs: 60_000,
      uid: caller.uid,
    });
    if (rateLimitRes) return rateLimitRes;

    const classRef = adminDb().collection("classes").doc(id);
    const enrollmentDocId = `${id}_${caller.uid}`;
    const enrollmentRef = adminDb().collection("enrollments").doc(enrollmentDocId);

    const result = await adminDb().runTransaction(async (t) => {
      const classDoc = await t.get(classRef);
      if (!classDoc.exists) {
        throw new ApiError(404, "NOT_FOUND", "Class not found");
      }

      const classData = classDoc.data()!;
      if (classData.status !== "published" && caller.role !== "admin") {
        throw new ApiError(
          403,
          "CLASS_NOT_PUBLISHED",
          "This classroom is currently in draft mode and not accepting enrollments."
        );
      }

      const isCoTeacher = Array.isArray(classData.coTeacherIds) && classData.coTeacherIds.includes(caller.uid);
      if (classData.teacherId === caller.uid || isCoTeacher || caller.role === "admin") {
        throw new ApiError(
          403,
          "OWNER_CANNOT_ENROLL",
          "Teachers and administrators cannot enroll as students in their own classes."
        );
      }

      const enrollmentDoc = await t.get(enrollmentRef);

      if (enrollmentDoc.exists) {
        const currentStatus = enrollmentDoc.data()?.status;
        if (currentStatus === "active") {
          return { status: "active", message: "Already enrolled" };
        }
        if (currentStatus === "pending") {
          return { status: "pending", message: "Join request is pending teacher approval" };
        }
      }

      const isPublic = classData.visibility === "public";
      const newStatus = isPublic ? "active" : "pending";

      t.set(
        enrollmentRef,
        {
          classId: id,
          uid: caller.uid,
          userEmail: caller.email,
          status: newStatus,
          joinedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

      if (isPublic) {
        t.update(classRef, {
          studentCount: FieldValue.increment(1),
          updatedAt: Timestamp.now(),
        });
      }

      return {
        status: newStatus,
        message: isPublic
          ? "Successfully enrolled!"
          : "Join request sent. Awaiting teacher approval.",
      };
    });

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
