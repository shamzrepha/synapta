import { randomInt } from "node:crypto";

/** No 0/O/1/I so codes survive being read out loud or copied from a board. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;
export const DEFAULT_MINUTES = 10;
export const DEFAULT_LATE_AFTER_MIN = 5;

export function generateCode(length = CODE_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

/** Uppercases and strips spaces/dashes. Returns "" for malformed input. */
export function normalizeCode(raw: string): string {
  const c = raw.toUpperCase().replace(/[\s-]/g, "");
  return c.length === CODE_LENGTH && [...c].every((ch) => CODE_ALPHABET.includes(ch)) ? c : "";
}

export interface SessionTimes {
  openedAt: number;
  expiresAt: number;
  closed?: boolean;
  lateAfterMin?: number;
}

export function isSessionOpen(s: SessionTimes, now: number): boolean {
  return !s.closed && now >= s.openedAt && now < s.expiresAt;
}

export function isLate(s: SessionTimes, checkedInAt: number): boolean {
  const lateAfter = (s.lateAfterMin ?? DEFAULT_LATE_AFTER_MIN) * 60_000;
  return checkedInAt - s.openedAt > lateAfter;
}

export function clampMinutes(n: unknown, min = 1, max = 240, fallback = DEFAULT_MINUTES): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.min(max, Math.max(min, v));
}

export interface CheckinLite {
  sessionId: string;
  uid: string;
  late: boolean;
}

export interface StudentAttendance {
  uid: string;
  present: number;
  late: number;
  total: number;
  percent: number;
}

/** Percentage of sessions attended per student. Check-ins for unknown sessions are ignored. */
export function buildReport(sessionIds: string[], checkins: CheckinLite[], studentUids: string[]): StudentAttendance[] {
  const valid = new Set(sessionIds);
  const per = new Map<string, { present: Set<string>; late: number }>();
  for (const u of studentUids) per.set(u, { present: new Set(), late: 0 });
  for (const c of checkins) {
    const p = per.get(c.uid);
    if (!p || !valid.has(c.sessionId) || p.present.has(c.sessionId)) continue;
    p.present.add(c.sessionId);
    if (c.late) p.late += 1;
  }
  const total = valid.size;
  return studentUids.map((uid) => {
    const p = per.get(uid)!;
    return {
      uid,
      present: p.present.size,
      late: p.late,
      total,
      percent: total === 0 ? 0 : Math.round((p.present.size / total) * 100),
    };
  });
}

function csvCell(v: string | number): string {
  let s = String(v);
  // Neutralise spreadsheet formula injection from student-controlled names.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: { name: string; present: number; late: number; total: number; percent: number }[]): string {
  const header = ["Student", "Sessions attended", "Late", "Total sessions", "Attendance %"];
  const lines = [header.join(",")];
  for (const r of rows) lines.push([r.name, r.present, r.late, r.total, r.percent].map(csvCell).join(","));
  return lines.join("\n") + "\n";
}
