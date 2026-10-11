import { adminDb } from "@/lib/firebase/admin";
import { AuthUser } from "@/lib/auth/requireUser";

export interface ClassAccessResult {
  classDoc: FirebaseFirestore.DocumentSnapshot;
  classData: FirebaseFirestore.DocumentData;
  isOwner: boolean;
  isAdmin: boolean;
  isEnrolled: boolean;
  enrollmentStatus: "active" | "pending" | "rejected" | "none";
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
  const isOwner = classData.teacherId === user.uid;
  const isAdmin = user.role === "admin";

  const enrollmentDocId = `${classId}_${user.uid}`;
  const enrollmentDoc = await adminDb().collection("enrollments").doc(enrollmentDocId).get();
  const enrollmentStatus = enrollmentDoc.exists
    ? (enrollmentDoc.data()?.status as "active" | "pending" | "rejected")
    : "none";
  const isEnrolled = enrollmentStatus === "active";

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
