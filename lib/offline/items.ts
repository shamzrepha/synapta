/** Metadata about offline downloads (kept in localStorage; the bytes live in the Cache Storage). */

export const DOWNLOADS_CACHE = "sunroot-downloads";
export const ITEMS_KEY = "sunroot.offline.items";

export interface OfflineItem {
  /** API url that was cached, e.g. /api/notebooks/abc */
  url: string;
  /** Page the student opens to read it, e.g. /notebook */
  page: string;
  title: string;
  bytes: number;
  savedAt: string;
}

export function parseItems(raw: unknown): OfflineItem[] {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  return v
    .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
    .filter((i) => typeof i.url === "string" && i.url.startsWith("/api/"))
    .map((i) => ({
      url: String(i.url),
      page: typeof i.page === "string" && i.page.startsWith("/") ? i.page : "/offline",
      title: typeof i.title === "string" && i.title ? i.title.slice(0, 120) : String(i.url),
      bytes: typeof i.bytes === "number" && i.bytes >= 0 ? i.bytes : 0,
      savedAt: typeof i.savedAt === "string" ? i.savedAt : "",
    }));
}

export function upsertItem(items: OfflineItem[], item: OfflineItem): OfflineItem[] {
  return [item, ...items.filter((i) => i.url !== item.url)];
}

export function removeItem(items: OfflineItem[], url: string): OfflineItem[] {
  return items.filter((i) => i.url !== url);
}

export function totalBytes(items: OfflineItem[]): number {
  return items.reduce((n, i) => n + i.bytes, 0);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
