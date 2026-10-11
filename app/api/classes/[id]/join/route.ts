import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);

    const classRef = adminDb().collection("classes").doc(id);
    const enrollmentDocId = `${id}_${caller.uid}`;
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
