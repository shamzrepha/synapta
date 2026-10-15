/** Minimal RFC 5545 calendar file for a study session. */

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 chars are folded with CRLF + space. */
export function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(" " + line.slice(i, i + 74));
  return parts.join("\r\n");
}

export function buildIcs(s: { id: string; title: string; description?: string; startAt: Date; endAt: Date; url?: string; now?: Date }): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sunroot//Study sessions//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${s.id}@sunroot`,
    `DTSTAMP:${icsDate(s.now ?? new Date())}`,
    `DTSTART:${icsDate(s.startAt)}`,
    `DTEND:${icsDate(s.endAt)}`,
    `SUMMARY:${escapeIcsText(s.title)}`,
    ...(s.description || s.url ? [`DESCRIPTION:${escapeIcsText([s.description, s.url].filter(Boolean).join("\n"))}`] : []),
    ...(s.url ? [`URL:${s.url}`] : []),
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Study session starts soon",
    "TRIGGER:-PT10M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export type RsvpStatus = "going" | "maybe" | "none";

/** New going/maybe arrays after a response; a user is in at most one list. */
export function applyRsvp(going: string[], maybe: string[], uid: string, status: RsvpStatus): { going: string[]; maybe: string[] } {
  const g = going.filter((u) => u !== uid);
  const m = maybe.filter((u) => u !== uid);
  if (status === "going") g.push(uid);
  if (status === "maybe") m.push(uid);
  return { going: g, maybe: m };
}
