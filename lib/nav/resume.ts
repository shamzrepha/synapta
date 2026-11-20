/** Pure helpers for "Continue where I left off", built on the reader's saved position (localStorage `sunroot:readpos:<classId>`). */
export const READPOS_PREFIX = "sunroot:readpos:";

export interface ReadPos {
  kc?: string;
  title?: string;
  snippet?: string;
  page?: number;
  at: number;
}

export function parseReadPos(raw: string | null | undefined): ReadPos | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (!v || typeof v !== "object" || typeof v.kc !== "string" || !v.kc) return null;
    return {
      kc: v.kc,
      title: typeof v.title === "string" ? v.title : undefined,
      snippet: typeof v.snippet === "string" ? v.snippet : undefined,
      page: typeof v.page === "number" ? v.page : undefined,
      at: typeof v.at === "number" ? v.at : 0,
    };
  } catch {
    return null;
  }
}

/** Most recently saved position across classes, restricted to classes the student is in. */
export function latestResume(entries: Array<{ key: string; raw: string | null }>, classes: Array<{ id: string; title: string }>): { classId: string; className: string; pos: ReadPos; href: string } | null {
  let best: { classId: string; className: string; pos: ReadPos; href: string } | null = null;
  for (const e of entries) {
    if (!e.key.startsWith(READPOS_PREFIX)) continue;
    const classId = e.key.slice(READPOS_PREFIX.length);
    const cls = classes.find((c) => c.id === classId);
    const pos = parseReadPos(e.raw);
    if (!cls || !pos) continue;
    if (!best || pos.at > best.pos.at) best = { classId, className: cls.title, pos, href: `/classes/${classId}/read` };
  }
  return best;
}
