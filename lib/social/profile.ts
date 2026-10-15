import { adminDb } from "@/lib/firebase/admin";
import { levelFromXp } from "@/lib/game/levels";

export interface PublicProfile {
  uid: string;
  displayName: string;
  username: string | null;
  photoURL: string | null;
  role: string;
  xp: number;
  level: number;
  leagueTier: number;
  streakDays: number;
  showOnLeaderboard: boolean;
}

export function toPublicProfile(uid: string, d: FirebaseFirestore.DocumentData | undefined): PublicProfile {
  const xp = typeof d?.xp === "number" ? d.xp : 0;
  return {
    uid,
    displayName: d?.displayName || d?.username || "Learner",
    username: d?.username || null,
    photoURL: d?.photoURL || null,
    role: d?.role || "student",
    xp,
    level: levelFromXp(xp).level,
    leagueTier: typeof d?.leagueTier === "number" ? d.leagueTier : 0,
    streakDays: d?.streakDays || 0,
    showOnLeaderboard: d?.settings?.showOnLeaderboard !== false,
  };
}

/** Batched public-profile lookup (never returns email or other private fields). */
export async function getPublicProfiles(uids: string[]): Promise<Map<string, PublicProfile>> {
  const unique = Array.from(new Set(uids.filter(Boolean)));
  const out = new Map<string, PublicProfile>();
  for (let i = 0; i < unique.length; i += 100) {
    const refs = unique.slice(i, i + 100).map((u) => adminDb().collection("users").doc(u));
    if (refs.length === 0) continue;
    const snaps = await adminDb().getAll(...refs);
    for (const s of snaps) {
      if (s.exists) out.set(s.id, toPublicProfile(s.id, s.data()));
    }
  }
  return out;
}
