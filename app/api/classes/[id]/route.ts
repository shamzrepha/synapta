import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { updateClassSchema } from "@/lib/validation/classes";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);

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
    const enrollmentDocId = `${id}_${caller.uid}`;
    const enrollmentDoc = await adminDb().collection("enrollments").doc(enrollmentDocId).get();
    const isEnrolled = enrollmentDoc.exists && enrollmentDoc.data()?.status === "active";
    const enrollmentStatus = enrollmentDoc.exists ? enrollmentDoc.data()?.status : "none";

    // Permission check for private classes
    if (classData.visibility === "private" && !isOwner && !isAdmin && !isEnrolled) {
      return NextResponse.json({
        ok: true,
        data: {
          class: {
            id,
            title: classData.title,
            subject: classData.subject,
            description: classData.description,
            teacherName: classData.teacherName,
            visibility: classData.visibility,
            studentCount: classData.studentCount || 0,
            status: classData.status,
          },
          kcs: [],
          enrollmentStatus,
          isOwner,
          accessDenied: true,
        },
      });
    }

    // Load KCs
    const kcsSnap = await adminDb()
      .collection("classes")
      .doc(id)
      .collection("kcs")
      .orderBy("order", "asc")
      .get();

    const kcs = kcsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Load caller's mastery for these KCs
    const masteryMap: Record<string, number> = {};
    if (kcs.length > 0) {
      for (const kc of kcs) {
        const mDoc = await adminDb()
          .collection("mastery")
          .doc(`${caller.uid}_${kc.id}`)
          .get();
        if (mDoc.exists) {
          masteryMap[kc.id] = mDoc.data()?.pL ?? 0.2;
        } else {
          // Default to KC's prior pL0
          masteryMap[kc.id] = (kc as { bkt?: { pL0?: number } })?.bkt?.pL0 ?? 0.2;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        class: { id, ...classData },
        kcs,
        masteryMap,
        enrollmentStatus,
        isOwner: isOwner || isAdmin,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    const body = await req.json();
    const parsed = updateClassSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Validation failed" } },
        { status: 400 }
      );
    }

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
        { ok: false, error: { code: "FORBIDDEN", message: "Only class owner or admin can update this class" } },
        { status: 403 }
      );
    }

    const updatePayload = {
      ...parsed.data,
      updatedAt: Timestamp.now(),
    };

    await classRef.update(updatePayload);

    return NextResponse.json({
      ok: true,
      data: { status: "updated", class: { ...classData, ...updatePayload } },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
