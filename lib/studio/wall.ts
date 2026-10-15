import { z } from "zod";

/** Maker Wall helpers: demo-video links, the weekly featured row and filters. All pure. */

export type VideoRef = { kind: "youtube" | "vimeo"; id: string; embed: string; url: string } | { kind: "upload"; embed: string; url: string };

/** Understands YouTube/Vimeo links and our own uploaded media paths. Returns null for anything else. */
export function parseVideoUrl(input: string | null | undefined): VideoRef | null {
  const raw = (input || "").trim();
  if (!raw) return null;
  if (/^\/api\/media\/posts\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(raw)) return { kind: "upload", embed: raw, url: raw };
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "").toLowerCase();
  if (host === "youtu.be") {
    const id = u.pathname.split("/")[1] || "";
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? yt(id) : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    let id = u.searchParams.get("v") || "";
    const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
    if (m) id = m[1];
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? yt(id) : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = u.pathname.match(/(?:\/video)?\/(\d{5,12})(?:\/|$)/);
    return m ? { kind: "vimeo", id: m[1], embed: `https://player.vimeo.com/video/${m[1]}`, url: `https://vimeo.com/${m[1]}` } : null;
  }
  return null;
}

function yt(id: string): VideoRef {
  return { kind: "youtube", id, embed: `https://www.youtube-nocookie.com/embed/${id}`, url: `https://youtu.be/${id}` };
}

export const publishSchema = z.object({
  description: z.string().trim().min(10, "Tell people what it does (at least 10 characters).").max(1200),
  videoUrl: z.string().trim().max(300).optional().default(""),
  coverPath: z
    .string()
    .max(200)
    .regex(/^posts\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/)
    .nullish(),
});

export interface WallItem {
  id: string;
  title: string;
  kind: string;
  ownerName: string;
  description: string;
  video: VideoRef | null;
  coverUrl: string | null;
  starCount: number;
  forkCount: number;
  publishedAt: string;
  partTypes: string[];
  total: number;
}

const WEEK = 7 * 24 * 3600 * 1000;

/** Score for "featured this week": stars and forks, remixes count double, a demo video adds a little. */
export function wallScore(i: Pick<WallItem, "starCount" | "forkCount" | "video">): number {
  return i.starCount + i.forkCount * 2 + (i.video ? 1 : 0);
}

/** The best projects published in the last 7 days; when the week is quiet, the best of all time fills the row. */
export function featured(items: WallItem[], now: number, n = 4): WallItem[] {
  const byScore = (a: WallItem, b: WallItem) => wallScore(b) - wallScore(a) || b.publishedAt.localeCompare(a.publishedAt);
  const recent = items.filter((i) => now - new Date(i.publishedAt).getTime() <= WEEK).sort(byScore);
  if (recent.length >= n) return recent.slice(0, n);
  const rest = items.filter((i) => !recent.includes(i)).sort(byScore);
  return [...recent, ...rest].slice(0, n);
}

export function filterWall(items: WallItem[], f: { kind?: string; part?: string; q?: string }): WallItem[] {
  const q = (f.q || "").trim().toLowerCase();
  return items.filter((i) => (!f.kind || i.kind === f.kind) && (!f.part || i.partTypes.includes(f.part)) && (!q || `${i.title} ${i.description} ${i.ownerName}`.toLowerCase().includes(q)));
}

export function sortWall(items: WallItem[], sort: "new" | "top"): WallItem[] {
  return [...items].sort(sort === "top" ? (a, b) => wallScore(b) - wallScore(a) || b.publishedAt.localeCompare(a.publishedAt) : (a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
