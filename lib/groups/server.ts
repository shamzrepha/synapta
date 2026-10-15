import { ApiError } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";

export const MAX_GROUPS_PER_USER = 20;
export const MAX_MEMBERS = 30;
export const MAX_GOALS = 50;

export type GroupRole = "owner" | "member";

export interface GoalItem {
  id: string;
  text: string;
  done: boolean;
  doneBy?: string | null;
}

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newInviteCode(rand: () => number = Math.random): string {
  return Array.from({ length: 8 }, () => CHARS[Math.floor(rand() * CHARS.length)]).join("");
}

export const groupRef = (id: string) => adminDb().collection("studyGroups").doc(id);

/** Loads a group and checks the caller is a member. */
export async function loadGroupForMember(id: string, uid: string) {
  const snap = await groupRef(id).get();
  if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Group not found");
  const g = snap.data()!;
  if (!Array.isArray(g.memberUids) || !g.memberUids.includes(uid)) throw new ApiError(403, "FORBIDDEN", "You're not in this group.");
  return { ref: snap.ref, g };
}
