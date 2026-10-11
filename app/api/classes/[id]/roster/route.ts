import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    const access = await assertClassAccess(caller, id, "view");
    const classData = access.classData;

    // 1. Fetch Teacher info (owner + co-teachers)
    const teacherUids = new Set<string>();
    if (classData.teacherId) teacherUids.add(classData.teacherId);
    if (Array.isArray(classData.coTeacherIds)) {
      classData.coTeacherIds.forEach((tId: string) => teacherUids.add(tId));
    }

    // 2. Fetch enrollments for students
    const enrollmentsSnap = await adminDb()
      .collection("enrollments")
      .where("classId", "==", id)
      .get();

    // Filter out any legacy teacher enrollment docs or owner docs
    const studentEnrollmentDocs = enrollmentsSnap.docs.filter((d) => {
      const eData = d.data();
      return eData.role !== "teacher" && !teacherUids.has(eData.uid);
    });

    // 3. Batch-fetch user profiles with getAll (killing N+1 reads)
    const allUidsToFetch = Array.from(
      new Set([...teacherUids, ...studentEnrollmentDocs.map((d) => d.data().uid as string)])
    );

    const userDocs = allUidsToFetch.length > 0
      ? await adminDb().getAll(...allUidsToFetch.map((u) => adminDb().collection("users").doc(u)))
      : [];

    const userProfileMap = new Map<string, Record<string, unknown>>();
    for (const uDoc of userDocs) {
      if (uDoc.exists) {
        userProfileMap.set(uDoc.id, uDoc.data() || {});
      }
    }

    // Assemble teachers list
    const teachers = Array.from(teacherUids).map((tUid) => {
      const uData = userProfileMap.get(tUid);
      return {
        uid: tUid,
        email: (uData?.email as string) || "Unknown",
        displayName: (uData?.displayName as string) || (tUid === classData.teacherId ? classData.teacherName : "Co-Teacher"),
        photoURL: (uData?.photoURL as string) || null,
        isOwner: tUid === classData.teacherId,
      };
    });

    // Assemble students and pending
    const students: Array<Record<string, unknown>> = [];
    const pending: Array<Record<string, unknown>> = [];

    for (const doc of studentEnrollmentDocs) {
      const eData = doc.data();
      const uData = userProfileMap.get(eData.uid);

      const studentInfo = {
        uid: eData.uid,
        email: (uData?.email as string) || eData.userEmail || "Unknown",
        displayName: (uData?.displayName as string) || "Student",
        photoURL: (uData?.photoURL as string) || null,
        status: eData.status,
        joinedAt: eData.joinedAt?.toDate ? eData.joinedAt.toDate().toISOString() : null,
      };

      if (eData.status === "active") {
        students.push(studentInfo);
      } else if (eData.status === "pending") {
        pending.push(studentInfo);
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        class: {
          id,
          title: classData.title,
          visibility: classData.visibility,
          studentCount: students.length,
        },
        teachers,
        students,
        pending,
        // Backward compatibility aliases
        activeStudents: students,
        pendingRequests: pending,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
