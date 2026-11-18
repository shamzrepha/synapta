import { adminDb } from "@/lib/firebase/admin";

export interface Campus {
  institution: string;
  studentCount: number;
  totalXp: number;
  readinessSum: number;
  topScholarName: string;
  topScholarXp: number;
  topScholarUid: string;
  topScholarPhoto: string | null;
}

const TTL_MS = 120_000;
const SCAN = 600;
let cache: { at: number; campuses: Campus[] } | null = null;

/**
 * Campuses ranked by total XP. One bounded read (the 600 highest-XP users), shared for two minutes by every caller, so the
 * Cup banner on /challenges, the Schools page and the leaderboard do not each scan the users collection.
 * People who hid themselves from leaderboards still count toward their campus total but are never named as its top scholar.
 */
export async function loadCampuses(now = Date.now()): Promise<Campus[]> {
  if (cache && now - cache.at < TTL_MS) return cache.campuses;
  const snap = await adminDb().collection("users").orderBy("xp", "desc").limit(SCAN).get();
  const map = new Map<string, Campus>();
  for (const d of snap.docs) {
    const u = d.data() || {};
    const inst = typeof u.institution === "string" ? u.institution.trim().slice(0, 140) : "";
    if (!inst) continue;
    const xp = typeof u.xp === "number" ? u.xp : 0;
    const readiness = typeof u.telemetryProfile?.predictedExamReadiness === "number" ? u.telemetryProfile.predictedExamReadiness : 68;
    const key = inst.toLowerCase();
    const cur = map.get(key) || { institution: inst, studentCount: 0, totalXp: 0, readinessSum: 0, topScholarName: "", topScholarXp: -1, topScholarUid: "", topScholarPhoto: null };
    cur.studentCount += 1;
    cur.totalXp += xp;
    cur.readinessSum += readiness;
    const visible = u.settings?.showOnLeaderboard !== false;
    if (visible && xp > cur.topScholarXp) {
      cur.topScholarXp = xp;
      cur.topScholarUid = d.id;
      cur.topScholarName = String(u.displayName || u.username || "Scholar");
      cur.topScholarPhoto = typeof u.photoURL === "string" ? u.photoURL : null;
    }
    map.set(key, cur);
  }
  const campuses = Array.from(map.values()).sort((a, b) => b.totalXp - a.totalXp || b.studentCount - a.studentCount);
  cache = { at: now, campuses };
  return campuses;
}

/** For tests */
export function resetCampusCache() {
  cache = null;
}
