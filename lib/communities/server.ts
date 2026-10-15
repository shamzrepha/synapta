import { adminDb } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import type { CommunityRole } from "./rules";

export function communityRef(id: string) {
  return adminDb().collection("communities").doc(id);
}

export async function loadCommunity(id: string) {
  const snap = await communityRef(id).get();
  if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Community not found.");
  return { id, ...(snap.data() as Record<string, unknown>) } as { id: string; name: string; kind: string; description: string; ownerUid: string; joinMode: "open" | "code"; joinCode: string; memberCount: number; createdAtMs: number };
}

export async function memberRole(id: string, uid: string): Promise<CommunityRole | null> {
  const snap = await communityRef(id).collection("members").doc(uid).get();
  return snap.exists ? ((snap.data()!.role as CommunityRole) || "member") : null;
}

/** Throws 403 unless the caller belongs to the community. */
export async function requireMember(id: string, uid: string): Promise<CommunityRole> {
  const role = await memberRole(id, uid);
  if (!role) throw new ApiError(403, "FORBIDDEN", "Join this community first.");
  return role;
}

export function userCommunityRef(uid: string, id: string) {
  return adminDb().collection("users").doc(uid).collection("communities").doc(id);
}
