/** Small helpers shared by the community features (ask, tutors, shout-outs, mentors, polls). */

export function iso(v: unknown): string | null {
  const t = v as { toDate?: () => Date } | undefined;
  return t?.toDate ? t.toDate().toISOString() : null;
}

export function countLinks(text: string): number {
  return (text.match(/(https?:\/\/|www\.)\S+/gi) || []).length;
}

/** Start of the current UTC day in ms (pure, takes `now` so it's testable). */
export function startOfUtcDay(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function cleanSubjects(list: unknown, max = 8): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const s of list) {
    const v = String(s || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40);
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= max) break;
  }
  return out;
}
