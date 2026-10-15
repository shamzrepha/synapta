import { adminDb } from "@/lib/firebase/admin";

/** Active, non-teacher student uids of a class. */
export async function activeStudentUids(classId: string, classData?: FirebaseFirestore.DocumentData): Promise<string[]> {
  const snap = await adminDb().collection("enrollments").where("classId", "==", classId).get();
  const teachers = new Set<string>();
  if (classData?.teacherId) teachers.add(classData.teacherId);
  if (Array.isArray(classData?.coTeacherIds)) classData.coTeacherIds.forEach((t: string) => teachers.add(t));
  const out: string[] = [];
  for (const d of snap.docs) {
    const e = d.data();
    if (e.status === "active" && e.role !== "teacher" && e.uid && !teachers.has(e.uid)) out.push(e.uid as string);
  }
  return Array.from(new Set(out));
}

/** Class ids a user is an active student in. */
export async function studentClassIds(uid: string): Promise<string[]> {
  const snap = await adminDb().collection("enrollments").where("uid", "==", uid).get();
  return snap.docs
    .map((d) => d.data())
    .filter((e) => e.status === "active" && e.role !== "teacher" && e.classId)
    .map((e) => e.classId as string);
}

/** Class ids a user owns or co-teaches. */
export async function teacherClassIds(uid: string): Promise<string[]> {
  const [a, b] = await Promise.all([
    adminDb().collection("classes").where("teacherId", "==", uid).get(),
    adminDb().collection("classes").where("coTeacherIds", "array-contains", uid).get(),
  ]);
  return Array.from(new Set([...a.docs.map((d) => d.id), ...b.docs.map((d) => d.id)]));
}

/** Titles for class ids (batched). */
export async function classTitles(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = Array.from(new Set(ids)).slice(0, 100);
  if (unique.length === 0) return out;
  const snaps = await adminDb().getAll(...unique.map((i) => adminDb().collection("classes").doc(i)));
  for (const s of snaps) if (s.exists) out.set(s.id, (s.data()?.title as string) || "Class");
  return out;
}

/** Display names only (never email). */
export async function displayNames(uids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = Array.from(new Set(uids.filter(Boolean)));
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const snaps = await adminDb().getAll(...chunk.map((u) => adminDb().collection("users").doc(u)));
    for (const s of snaps) out.set(s.id, (s.exists && (s.data()?.displayName || s.data()?.username)) || "Student");
  }
  return out;
}

export function isTeacherRole(role?: string): boolean {
  return role === "teacher" || role === "admin";
}
