import { adminDb } from "@/lib/firebase/admin";
import { AuthUser } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";

export interface ClassAccessResult {
  classDoc: FirebaseFirestore.DocumentSnapshot;
  classData: FirebaseFirestore.DocumentData;
  isOwner: boolean;
  isAdmin: boolean;
  isEnrolled: boolean;
  enrollmentStatus: "active" | "pending" | "rejected" | "none";
  role: "owner" | "admin" | "student" | "visitor";
  /** Lessons, topics, quizzes, AI tools: members only (teacher, co-teacher, admin, enrolled student) */
  canView: boolean;
  /** Landing page (title, description, topic titles) for public published classes */
  canPreview: boolean;
  canMutate: boolean;
}

/**
 * Pure access rules. A shared class link never grants access by itself: visitors only get the
 * landing page (public classes) and must enroll — or use the teacher's invite code — to get in.
 */
export function computeClassAccess(params: {
  classData: FirebaseFirestore.DocumentData;
  uid: string;
  userRole?: string;
  enrollmentStatus: "active" | "pending" | "rejected" | "none";
}) {
  const { classData, uid, userRole } = params;
  const isCoTeacher = Array.isArray(classData.coTeacherIds) && classData.coTeacherIds.includes(uid);
  const isOwner = classData.teacherId === uid || isCoTeacher;
  const isAdmin = userRole === "admin";
  // If the user is the owner, ignore any legacy enrollment doc
  const enrollmentStatus = isOwner ? "none" : params.enrollmentStatus;
  const isEnrolled = enrollmentStatus === "active";
  const role: ClassAccessResult["role"] = isOwner ? "owner" : isAdmin ? "admin" : isEnrolled ? "student" : "visitor";
  const canView = isOwner || isAdmin || isEnrolled;
  const canPreview = canView || (classData.visibility === "public" && classData.status === "published");
  return { isOwner, isAdmin, isEnrolled, enrollmentStatus, role, canView, canPreview, canMutate: isOwner || isAdmin };
}

export class ClassAccessError extends ApiError {
  constructor(message: string, code: string, status: number) {
    super(status, code, message);
    this.name = "ClassAccessError";
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
  const enrollmentDoc = await adminDb().collection("enrollments").doc(`${classId}_${user.uid}`).get();
  const access = computeClassAccess({
    classData,
    uid: user.uid,
    userRole: user.role,
    enrollmentStatus: enrollmentDoc.exists ? ((enrollmentDoc.data()?.status as "active" | "pending" | "rejected") || "none") : "none",
  });

  return { classDoc, classData, ...access };
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
      access.enrollmentStatus === "pending"
        ? "Your request to join this class is waiting for the teacher's approval."
        : "Enroll in this class to open its lessons and activities.",
      "NOT_ENROLLED",
      403
    );
  }

  return access;
}
