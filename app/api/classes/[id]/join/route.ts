import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { notify, notifyMany } from "@/lib/notifications/server";
import { z } from "zod";

const bodySchema = z.object({ code: z.string().trim().max(40).optional(), as: z.enum(["student", "teacher"]).optional() }).default({});

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const parsedBody = bodySchema.safeParse(await req.json().catch(() => ({})));
    const inviteCode = parsedBody.success ? parsedBody.data.code?.toUpperCase() || "" : "";
    const joinAs = parsedBody.success ? parsedBody.data.as || "student" : "student";

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
      const isAdmin = caller.role === "admin";

      // Administrators can step into any class as a co-teacher
      if (joinAs === "teacher") {
        if (!isAdmin) throw new ApiError(403, "FORBIDDEN", "Only administrators can join a class as a teacher.");
        if (classData.teacherId === caller.uid || isCoTeacher) return { status: "teacher", message: "You already teach this class" };
        t.update(classRef, { coTeacherIds: FieldValue.arrayUnion(caller.uid), updatedAt: Timestamp.now() });
        return { status: "teacher", message: "You are now a co-teacher of this class" };
      }

      // Owners and co-teachers teach their own class; an administrator can still join anyone else's as a student
      if (classData.teacherId === caller.uid || isCoTeacher) {
        throw new ApiError(
          403,
          "OWNER_CANNOT_ENROLL",
          "Teachers cannot enroll as students in their own classes."
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
      // The teacher's invite link/code admits students straight into private classes
      const validInvite = !!inviteCode && typeof classData.joinCode === "string" && classData.joinCode.toUpperCase() === inviteCode;
      if (inviteCode && !validInvite && !isPublic) {
        throw new ApiError(400, "INVALID_CODE", "That invite code isn't valid for this class. Ask your teacher for a new link.");
      }
      // administrators skip the approval queue
      const autoAdmit = isPublic || validInvite || isAdmin;
      const newStatus = autoAdmit ? "active" : "pending";

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

      if (autoAdmit) {
        t.update(classRef, {
          studentCount: FieldValue.increment(1),
          updatedAt: Timestamp.now(),
        });
      }

      return {
        status: newStatus,
        message: autoAdmit ? "Successfully enrolled!" : "Join request sent. Awaiting teacher approval.",
        isNew: true,
        title: String(classData.title || "your class"),
        teacherIds: [classData.teacherId, ...(Array.isArray(classData.coTeacherIds) ? classData.coTeacherIds : [])].filter(Boolean) as string[],
      };
    });

    if ("isNew" in result && result.isNew) {
      if (result.status === "pending") {
        await notifyMany(result.teacherIds, {
          type: "system",
          title: "New request to join your class",
          body: `${caller.email || "A student"} wants to join ${result.title}`,
          href: `/classes/${id}/manage`,
          icon: "🙋",
          actorUid: caller.uid,
        }).catch(() => null);
      } else {
        await notify(caller.uid, {
          type: "system",
          title: `You're in! Welcome to ${result.title}`,
          body: "Open the class to start learning.",
          href: `/classes/${id}`,
          icon: "🎓",
        }).catch(() => null);
      }
    }

    return NextResponse.json({
      ok: true,
      data: { status: result.status, message: result.message },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
