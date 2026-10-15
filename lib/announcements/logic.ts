export interface AnnouncementLite {
  id: string;
  pinned: boolean;
  createdAt: string;
}

/** Pinned first, then newest first. */
export function sortAnnouncements<T extends AnnouncementLite>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function unreadCount(list: { id: string }[], readIds: Set<string>): number {
  return list.reduce((n, a) => n + (readIds.has(a.id) ? 0 : 1), 0);
}

/** Read receipts only count current students, so people who left the class do not skew the percentage. */
export function readStats(readerUids: string[], studentUids: string[]) {
  const students = new Set(studentUids);
  const read = new Set(readerUids.filter((u) => students.has(u)));
  const total = students.size;
  return { read: read.size, total, percent: total === 0 ? 0 : Math.round((read.size / total) * 100) };
}

export function cleanText(s: string, max: number): string {
  return s.replace(/\r\n/g, "\n").trim().slice(0, max);
}
