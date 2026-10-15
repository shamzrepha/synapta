import { adminDb, Timestamp } from "@/lib/firebase/admin";

function ref(uid: string, kcId: string) {
  return adminDb().collection("practiceHistory").doc(`${uid}_${kcId}`);
}

export async function getSeen(uid: string, kcId: string, kind: "quiz" | "cards"): Promise<string[]> {
  const snap = await ref(uid, kcId).get();
  const v = snap.data()?.[kind === "quiz" ? "quizSeen" : "cardSeen"];
  return Array.isArray(v) ? v : [];
}

export async function setSeen(uid: string, kcId: string, kind: "quiz" | "cards", seen: string[]): Promise<void> {
  await ref(uid, kcId)
    .set({ uid, kcId, [kind === "quiz" ? "quizSeen" : "cardSeen"]: seen, updatedAt: Timestamp.now() }, { merge: true })
    .catch(() => null);
}
