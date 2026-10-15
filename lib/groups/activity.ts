import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { bumpChannel } from "@/lib/live/server";
import { computeStreak, dayId, type StreakInfo } from "@/lib/streaks/days";

export type GroupActivityKind = "focus" | "quiz" | "checkin";

/**
 * Marks today as active for every study group the user belongs to. A group's streak day counts
 * when at least one member does a focus block, finishes a quiz or checks in.
 * Best-effort and cheap: call it from any server code path (focus completion calls it already;
 * quiz routes can call `recordGroupActivity(uid, "quiz")`).
 */
export async function recordGroupActivity(uid: string, kind: GroupActivityKind, groupId?: string): Promise<void> {
  try {
    let ids: string[];
    if (groupId) ids = [groupId];
    else {
      const snap = await adminDb().collection("studyGroups").where("memberUids", "array-contains", uid).limit(20).get();
      ids = snap.docs.map((d) => d.id);
    }
    const day = dayId();
    await Promise.all(
      ids.map(async (id) => {
        await adminDb()
          .collection("studyGroups")
          .doc(id)
          .collection("activity")
          .doc(day)
          .set({ day, uids: FieldValue.arrayUnion(uid), [`kinds.${kind}`]: FieldValue.arrayUnion(uid), updatedAt: Timestamp.now() }, { merge: true });
        await bumpChannel(`group:${id}`);
      })
    );
  } catch (err) {
    console.warn("[groups] recordGroupActivity failed", err instanceof Error ? err.message : err);
  }
}

export async function loadGroupStreak(groupId: string): Promise<StreakInfo & { todayUids: string[] }> {
  const snap = await adminDb().collection("studyGroups").doc(groupId).collection("activity").orderBy("day", "desc").limit(120).get();
  const today = dayId();
  const days = snap.docs.map((d) => String(d.data().day || d.id));
  const todayDoc = snap.docs.find((d) => d.id === today);
  const todayUids = todayDoc && Array.isArray(todayDoc.data().uids) ? (todayDoc.data().uids as string[]) : [];
  return { ...computeStreak(days, today), todayUids };
}
