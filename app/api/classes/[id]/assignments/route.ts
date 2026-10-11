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
    const caller = await requireUser(req);

    // Fetch class
    const classDoc = await adminDb().collection("classes").doc(id).get();
    if (!classDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Class not found" } },
        { status: 404 }
      );
    }

    const classData = classDoc.data()!;
    const isOwner = classData.teacherId === caller.uid;
    const isAdmin = caller.role === "admin";

    // Check enrollment
    const enrollmentDoc = await adminDb()
      .collection("enrollments")
      .doc(`${id}_${caller.uid}`)
      .get();

    const isEnrolled = enrollmentDoc.exists && enrollmentDoc.data()?.status === "active";

    if (!isOwner && !isAdmin && !isEnrolled) {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Access forbidden" } },
        { status: 403 }
      );
    }

    const snap = await adminDb()
      .collection("classes")
      .doc(id)
      .collection("assignments")
      .get();

    const assignments = snap.docs
      .map((d) => {
        const data = d.data() as Record<string, any>;
        return {
          id: d.id,
          ...data,
          status: (data.status as string) || "draft",
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : null,
        };
      })
      .filter((a) => {
        // Students can only see published assignments
        if (isOwner || isAdmin) return true;
        return a.status === "published";
      })
      .sort((a: any, b: any) => {
        const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tB - tA;
      });

    return NextResponse.json({
      ok: true,
      data: {
        assignments,
        isTeacher: isOwner || isAdmin,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
