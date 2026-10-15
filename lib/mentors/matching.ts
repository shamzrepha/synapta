/** Pure mentor/mentee matching. No I/O so it is easy to test. */

export type MentorRole = "mentor" | "mentee";

export const AVAILABILITY_SLOTS = [
  { id: "weekday_morning", label: "Weekday mornings" },
  { id: "weekday_afternoon", label: "Weekday afternoons" },
  { id: "weekday_evening", label: "Weekday evenings" },
  { id: "weekend", label: "Weekends" },
] as const;

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 20;

export interface MentorProfile {
  uid: string;
  role: MentorRole;
  subjects: string[];
  /** year or grade, higher = more senior */
  level: number;
  availability: string[];
}

export interface Match {
  uid: string;
  role: MentorRole;
  score: number;
  sharedSubjects: string[];
  sharedAvailability: string[];
  levelGap: number;
  reasons: string[];
}

export function intersect(a: string[], b: string[]): string[] {
  const set = new Set(b);
  return a.filter((x) => set.has(x));
}

/** Mentor must be at least one level above the mentee. */
export function levelOk(mentorLevel: number, menteeLevel: number): boolean {
  return mentorLevel - menteeLevel >= 1;
}

export function scoreMatch(me: MentorProfile, other: MentorProfile): Match | null {
  if (me.uid === other.uid || me.role === other.role) return null;
  const mentor = me.role === "mentor" ? me : other;
  const mentee = me.role === "mentee" ? me : other;
  if (!levelOk(mentor.level, mentee.level)) return null;
  const sharedSubjects = intersect(me.subjects, other.subjects);
  if (sharedSubjects.length === 0) return null;
  const sharedAvailability = intersect(me.availability, other.availability);
  const levelGap = mentor.level - mentee.level;
  // a gap of 1-3 levels is the sweet spot; much older mentors score a little lower
  const gapBonus = levelGap <= 3 ? 3 : levelGap <= 6 ? 1 : 0;
  const score = sharedSubjects.length * 10 + sharedAvailability.length * 4 + gapBonus;
  const reasons = [
    `Both into ${sharedSubjects.slice(0, 3).join(", ")}`,
    `${levelGap} level${levelGap === 1 ? "" : "s"} ${me.role === "mentee" ? "ahead of you" : "below you"}`,
  ];
  reasons.push(sharedAvailability.length ? `Free at the same time (${sharedAvailability.length} slot${sharedAvailability.length === 1 ? "" : "s"})` : "No shared free time yet, you can arrange it in chat");
  return { uid: other.uid, role: other.role, score, sharedSubjects, sharedAvailability, levelGap, reasons };
}

export function findMatches(me: MentorProfile, candidates: MentorProfile[], limit = 20, exclude: Set<string> = new Set()): Match[] {
  const out: Match[] = [];
  for (const c of candidates) {
    if (exclude.has(c.uid)) continue;
    const m = scoreMatch(me, c);
    if (m) out.push(m);
  }
  return out.sort((a, b) => b.score - a.score || a.levelGap - b.levelGap || a.uid.localeCompare(b.uid)).slice(0, limit);
}

export type RequestAction = "accept" | "decline" | "cancel";

/** Who may do what on a request, given its status. */
export function canAct(action: RequestAction, status: string, callerUid: string, req: { fromUid: string; toUid: string }): boolean {
  if (status !== "pending") return false;
  if (action === "cancel") return callerUid === req.fromUid;
  return callerUid === req.toUid;
}
