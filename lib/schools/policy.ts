import { randomInt } from "node:crypto";

/**
 * Pure rules for the school / principal portal, kept out of the route so they can be tested without a database.
 */

export interface SchoolLike {
  principalUid?: unknown;
  teacherUids?: unknown;
  /** Set only by a platform admin once the school is confirmed real (invoice paid / vetted). */
  verified?: unknown;
}

export interface CallerLike {
  uid: string;
  role: string;
}

/** Platform admin, the principal, or a teacher the principal added. */
export function canManageSchool(caller: CallerLike, school: SchoolLike): boolean {
  if (caller.role === "admin") return true;
  if (typeof school.principalUid === "string" && school.principalUid && school.principalUid === caller.uid) return true;
  return Array.isArray(school.teacherUids) && school.teacherUids.includes(caller.uid);
}

/** Only the principal (or a platform admin) may make other people teachers: a teacher must not be able to promote friends. */
export function canAssignTeachers(caller: CallerLike, school: SchoolLike): boolean {
  if (caller.role === "admin") return true;
  // A self-created school is unverified, so its creator cannot promote themselves or friends to teacher.
  return school.verified === true && typeof school.principalUid === "string" && !!school.principalUid && school.principalUid === caller.uid;
}

export type Membership = "join" | "already_here" | "other_school";

/** One school per account: a user who already belongs to another school cannot be added to a second one. */
export function membershipFor(user: { schoolId?: unknown }, schoolId: string): Membership {
  const current = typeof user.schoolId === "string" ? user.schoolId.trim() : "";
  if (!current) return "join";
  return current === schoolId ? "already_here" : "other_school";
}

function millis(v: unknown): number {
  if (typeof v === "number") return v;
  const t = v as { toMillis?: () => number } | null | undefined;
  return typeof t?.toMillis === "function" ? t.toMillis() : 0;
}

/**
 * A school sponsors accounts on the free or exam plan, or one it already sponsors. Someone who paid for Plus or Pro keeps the
 * plan they paid for (we never overwrite paid time), but still becomes a member.
 */
export function sponsorshipPatch(user: { plan?: unknown; planExpiresAt?: unknown }, seatExpiresAt: unknown, now = Date.now()): Record<string, unknown> {
  const plan = typeof user.plan === "string" ? user.plan : "free";
  const activePaid = plan !== "free" && plan !== "exam" && plan !== "school" && millis(user.planExpiresAt) > now;
  return activePaid ? {} : { plan: "school", planExpiresAt: seatExpiresAt };
}

/** SCH-NAME-123456: unguessable enough that a stranger cannot find a school by trying codes. */
export function makeSchoolCode(name: string): string {
  const prefix = name
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 4)
    .toUpperCase()
    .padEnd(3, "X");
  return `SCH-${prefix}-${randomInt(100_000, 1_000_000)}`;
}
