import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);

    const classDoc = await adminDb().collection("classes").doc(id).get();
    if (!classDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Class not found" } },
        { status: 404 }
      );
    }

    const classData = classDoc.data()!;
    if (classData.teacherId !== caller.uid && caller.role !== "admin") {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Unauthorized to view roster" } },
        { status: 403 }
      );
    }

    const enrollmentsSnap = await adminDb()
      .collection("enrollments")
      .where("classId", "==", id)
      .get();

    const activeStudents = [];
    const pendingRequests = [];

    for (const doc of enrollmentsSnap.docs) {
      const eData = doc.data();
      const userDoc = await adminDb().collection("users").doc(eData.uid).get();
      const uData = userDoc.exists ? userDoc.data() : null;

      const studentInfo = {
        uid: eData.uid,
        email: uData?.email || eData.userEmail || "Unknown",
        displayName: uData?.displayName || "Student",
        photoURL: uData?.photoURL || null,
        status: eData.status,
        joinedAt: eData.joinedAt?.toDate ? eData.joinedAt.toDate().toISOString() : null,
      };

      if (eData.status === "active") {
        activeStudents.push(studentInfo);
      } else if (eData.status === "pending") {
        pendingRequests.push(studentInfo);
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        class: { id, title: classData.title, visibility: classData.visibility },
        activeStudents,
        pendingRequests,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
