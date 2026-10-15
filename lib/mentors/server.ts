import { adminDb } from "@/lib/firebase/admin";
import type { MentorProfile, MentorRole } from "./matching";

export function toMentorProfile(d: FirebaseFirestore.DocumentData): MentorProfile {
  return {
    uid: d.uid,
    role: d.role as MentorRole,
    subjects: (d.subjects as string[]) || [],
    level: typeof d.level === "number" ? d.level : 1,
    availability: (d.availability as string[]) || [],
  };
}

export function pairId(a: string, b: string): string {
  return [a, b].sort().join("_");
}

/** All requests the user is part of (as mentor or mentee), newest first. */
export async function requestsFor(uid: string) {
  const col = adminDb().collection("mentorRequests");
  const [a, b] = await Promise.all([col.where("mentorUid", "==", uid).limit(100).get(), col.where("menteeUid", "==", uid).limit(100).get()]);
  const map = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  [...a.docs, ...b.docs].forEach((d) => map.set(d.id, d));
  return Array.from(map.values()).sort((x, y) => (y.data().createdAt?.toMillis?.() || 0) - (x.data().createdAt?.toMillis?.() || 0));
}
