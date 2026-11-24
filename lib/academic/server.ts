import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { levelNow, type Academic, type AcademicInput, checkAcademic } from "./academic";

/** Reads the academic profile stored on a user document (tolerates older or half-filled data). */
export function readAcademic(user: Record<string, unknown> | undefined): Academic | null {
  const a = user?.academic as Partial<Academic> | undefined;
  if (!a || typeof a !== "object" || typeof a.level !== "number" || !a.institution || !a.department) return null;
  const toMs = (v: unknown) => (typeof v === "number" ? v : v && typeof (v as { toMillis?: () => number }).toMillis === "function" ? (v as { toMillis: () => number }).toMillis() : 0);
  return {
    institutionId: typeof a.institutionId === "string" ? a.institutionId : null,
    institution: String(a.institution),
    school: String(a.school ?? ""),
    department: String(a.department),
    level: a.level,
    levelSetAt: toMs(a.levelSetAt) || Date.now(),
    lockedAt: toMs(a.lockedAt) || Date.now(),
  };
}

/** The same fields the older parts of the app read (institution, department, "300L"), kept in step so nothing else breaks. */
export function legacyFields(a: Academic, now = Date.now()) {
  return { institution: a.institution, department: a.department, level: `${levelNow(a, now)}L` };
}

export function buildAcademic(input: AcademicInput, now = Date.now()): { ok: true; academic: Academic } | { ok: false; message: string } {
  const c = checkAcademic(input);
  if (!c.ok) return c;
  return { ok: true, academic: { ...c.value, levelSetAt: now, lockedAt: now } };
}

/** Saves a (new or approved) academic profile on a user and the legacy fields beside it. */
export async function saveAcademic(uid: string, a: Academic): Promise<void> {
  await adminDb().collection("users").doc(uid).set(
    { academic: { ...a }, ...legacyFields(a, a.levelSetAt), updatedAt: Timestamp.now() },
    { merge: true },
  );
}
