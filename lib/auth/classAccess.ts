import { adminDb } from "@/lib/firebase/admin";
import { AuthUser } from "@/lib/auth/requireUser";

export interface ClassAccessResult {
  classDoc: FirebaseFirestore.DocumentSnapshot;
  classData: FirebaseFirestore.DocumentData;
  isOwner: boolean;
  isAdmin: boolean;
  isEnrolled: boolean;
  enrollmentStatus: "active" | "pending" | "rejected" | "none";
  role: "owner" | "admin" | "student" | "visitor";
  canView: boolean;
  canMutate: boolean;
}

export class ClassAccessError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ClassAccessError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Checks authorization for a user against a target classroom.
 */
export async function getClassAccess(
  user: AuthUser,
  classId: string
): Promise<ClassAccessResult> {
  const classDoc = await adminDb().collection("classes").doc(classId).get();
  if (!classDoc.exists) {
    throw new ClassAccessError("Classroom not found", "NOT_FOUND", 404);
  }

  const classData = classDoc.data()!;
  const isCoTeacher = Array.isArray(classData.coTeacherIds) && classData.coTeacherIds.includes(user.uid);
  const isOwner = classData.teacherId === user.uid || isCoTeacher;
  const isAdmin = user.role === "admin";

  const enrollmentDocId = `${classId}_${user.uid}`;
  const enrollmentDoc = await adminDb().collection("enrollments").doc(enrollmentDocId).get();
  const enrollmentData = enrollmentDoc.exists ? enrollmentDoc.data() : null;
  // If the user is the owner/admin, ignore any legacy enrollment doc
  const enrollmentStatus = !isOwner && enrollmentData
    ? (enrollmentData.status as "active" | "pending" | "rejected")
    : "none";
  const isEnrolled = enrollmentStatus === "active";

  let role: "owner" | "admin" | "student" | "visitor" = "visitor";
  if (isOwner) {
    role = "owner";
  } else if (isAdmin) {
    role = "admin";
  } else if (isEnrolled) {
    role = "student";
  }

  const isPublicAndPublished =
    classData.visibility === "public" && classData.status === "published";

  const canView = isPublicAndPublished || isOwner || isAdmin || isEnrolled;
  const canMutate = isOwner || isAdmin;

  return {
    classDoc,
    classData,
    isOwner,
    isAdmin,
    isEnrolled,
    enrollmentStatus,
    role,
    canView,
    canMutate,
  };
}

/**
 * Asserts that the caller has view or mutate access to the classroom, throwing
 * a descriptive 403 error if unauthorized.
 */
export async function assertClassAccess(
  user: AuthUser,
  classId: string,
  mode: "view" | "mutate" = "view"
): Promise<ClassAccessResult> {
  const access = await getClassAccess(user, classId);

  if (mode === "mutate" && !access.canMutate) {
    throw new ClassAccessError(
      "Only the classroom teacher or an administrator can modify this resource.",
      "FORBIDDEN",
      403
    );
  }

  if (mode === "view" && !access.canView) {
    throw new ClassAccessError(
      "This classroom is private. You must be actively enrolled to access course materials.",
      "FORBIDDEN",
      403
    );
  }

  return access;
}
