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
    const classDoc = await classRef.get();

    if (!classDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Class not found" } },
        { status: 404 }
      );
    }

    const classData = classDoc.data()!;
    const enrollmentDocId = `${id}_${caller.uid}`;
    const enrollmentRef = adminDb().collection("enrollments").doc(enrollmentDocId);
    const enrollmentDoc = await enrollmentRef.get();

    if (enrollmentDoc.exists) {
      const currentStatus = enrollmentDoc.data()?.status;
      if (currentStatus === "active") {
        return NextResponse.json({
          ok: true,
          data: { status: "active", message: "Already enrolled" },
        });
      }
      if (currentStatus === "pending") {
        return NextResponse.json({
          ok: true,
          data: { status: "pending", message: "Join request is pending teacher approval" },
        });
      }
    }

    const isPublic = classData.visibility === "public";
    const newStatus = isPublic ? "active" : "pending";

    await enrollmentRef.set({
      classId: id,
      uid: caller.uid,
      userEmail: caller.email,
      status: newStatus,
      joinedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    if (isPublic) {
      await classRef.update({
        studentCount: FieldValue.increment(1),
        updatedAt: Timestamp.now(),
      });
    }

    return NextResponse.json({
      ok: true,
      data: {
        status: newStatus,
        message: isPublic
          ? "Successfully enrolled!"
          : "Join request sent. Awaiting teacher approval.",
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
