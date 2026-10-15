import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import { dayId } from "@/lib/streaks/days";
import { computeStreak } from "@/lib/streaks/days";
import { PRESENCE_MS, makeCode, type TimerConfig } from "./timer";

export interface FocusRoomDoc {
  code: string;
  title: string;
  ownerUid: string;
  ownerName: string;
  focusMin: number;
  breakMin: number;
  anchorMs: number | null;
}

export const MAX_MEMBERS = 30;

export const roomRef = (code: string) => adminDb().collection("focusRooms").doc(code);

export async function loadRoom(code: string): Promise<FocusRoomDoc> {
  const snap = await roomRef(code).get();
  if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Room not found. Check the code.");
  return snap.data() as FocusRoomDoc;
}

export function roomConfig(r: FocusRoomDoc): TimerConfig {
  return { focusMin: r.focusMin, breakMin: r.breakMin };
}

export async function uniqueCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = makeCode();
    if (!(await roomRef(code).get()).exists) return code;
  }
  throw new ApiError(500, "INTERNAL", "Couldn't allocate a room code.");
}

export interface MemberView {
  uid: string;
  displayName: string;
  photoURL: string | null;
  doing: string;
  present: boolean;
  isOwner: boolean;
}

export async function loadMembers(code: string, ownerUid: string, nowMs: number) {
  const snap = await roomRef(code).collection("members").limit(60).get();
  const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<Record<string, unknown> & { id: string }>;
  const members: MemberView[] = raw
    .map((m) => ({
      uid: m.id,
      displayName: String(m.displayName || "Learner"),
      photoURL: (m.photoURL as string | null) || null,
      doing: String(m.doing || ""),
      present: nowMs - Number(m.lastSeenMs || 0) < PRESENCE_MS,
      isOwner: m.id === ownerUid,
    }))
    // drop people who vanished more than 15 minutes ago so the list stays fresh
    .filter((m, i) => m.present || nowMs - Number(raw[i].lastSeenMs || 0) < 15 * 60_000);
  return { members, raw };
}

export interface FocusSessionRow {
  uid: string;
  code: string;
  minutes: number;
  day: string;
  doing: string;
  completedAtMs: number;
}

/** A user's recent completed focus blocks (bounded; sorted in memory so no composite index is needed). */
export async function loadUserSessions(uid: string): Promise<FocusSessionRow[]> {
  const snap = await adminDb().collection("focusSessions").where("uid", "==", uid).limit(400).get();
  return snap.docs.map((d) => d.data() as FocusSessionRow).sort((a, b) => b.completedAtMs - a.completedAtMs);
}

export function focusStats(rows: FocusSessionRow[], today = dayId()) {
  const perDay = new Map<string, number>();
  for (const r of rows) perDay.set(r.day, (perDay.get(r.day) || 0) + r.minutes);
  const streak = computeStreak(perDay.keys(), today);
  const last14: Array<{ day: string; minutes: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const day = dayId(Date.parse(`${today}T00:00:00Z`) - i * 86_400_000);
    last14.push({ day, minutes: perDay.get(day) || 0 });
  }
  return {
    totalBlocks: rows.length,
    totalMinutes: rows.reduce((a, r) => a + r.minutes, 0),
    todayMinutes: perDay.get(today) || 0,
    streak,
    last14,
  };
}

export const nowTs = () => Timestamp.now();
