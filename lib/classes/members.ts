import { adminDb } from "@/lib/firebase/admin";

/** Active students of a class (for notifications / leaderboards). */
export async function getActiveStudentUids(classId: string): Promise<string[]> {
  const snap = await adminDb().collection("enrollments").where("classId", "==", classId).where("status", "==", "active").get();
  return snap.docs.map((d) => d.data().uid as string).filter(Boolean);
}

/** Class IDs the user teaches or is actively enrolled in. */
export async function getMyClassIds(uid: string): Promise<string[]> {
  const [enrolled, teaching] = await Promise.all([
    adminDb().collection("enrollments").where("uid", "==", uid).where("status", "==", "active").get(),
    adminDb().collection("classes").where("teacherId", "==", uid).get(),
  ]);
  return Array.from(new Set([...enrolled.docs.map((d) => d.data().classId as string), ...teaching.docs.map((d) => d.id)])).filter(Boolean);
}
