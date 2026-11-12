/** Finds freely licensed pictures on Wikimedia Commons (diagrams, parts, anatomy, equipment) to show next to a lesson. */

export type ImageFilter = "all" | "diagram" | "photo";

export interface FoundImage {
  url: string;
  page: string;
  title: string;
  author: string;
  license: string;
  width: number;
  height: number;
}

const ALLOWED_HOSTS = ["https://upload.wikimedia.org/", "https://thumb.wikimedia.org/"];
const OK_MIME = /^image\/(jpeg|png|webp|svg\+xml)$/;

export const isAllowedImageUrl = (u: unknown): u is string => typeof u === "string" && ALLOWED_HOSTS.some((h) => u.startsWith(h)) && u.length < 600;

const strip = (s: unknown) =>
  String(s ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

/** Turns a Commons API answer into a short list of usable pictures. Never throws on odd data. */
export function parseCommons(json: unknown): FoundImage[] {
  const pages = (json as { query?: { pages?: Record<string, unknown> } })?.query?.pages;
  if (!pages || typeof pages !== "object") return [];
  const out: Array<FoundImage & { idx: number }> = [];
  for (const p of Object.values(pages) as Array<Record<string, unknown>>) {
    const info = (p.imageinfo as Array<Record<string, unknown>> | undefined)?.[0];
    if (!info) continue;
    const url = info.thumburl || info.url;
    if (!isAllowedImageUrl(url) || !OK_MIME.test(String(info.mime || ""))) continue;
    const w = Number(info.thumbwidth || info.width) || 0;
    const h = Number(info.thumbheight || info.height) || 0;
    if (w > 0 && h > 0 && (w < 140 || h < 140 || w / h > 4.2 || h / w > 4.2)) continue;
    const meta = (info.extmetadata || {}) as Record<string, { value?: unknown }>;
    out.push({
      idx: Number(p.index) || 99,
      url: url as string,
      page: typeof info.descriptionurl === "string" && info.descriptionurl.startsWith("https://commons.wikimedia.org/") ? info.descriptionurl : "https://commons.wikimedia.org/",
      title: strip(String(p.title || "").replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "")),
      author: strip(meta.Artist?.value) || "Unknown author",
      license: strip(meta.LicenseShortName?.value) || "See source",
      width: w,
      height: h,
    });
  }
  return out.sort((a, b) => a.idx - b.idx).map(({ idx: _i, ...rest }) => (void _i, rest));
}

export function commonsUrl(query: string, limit = 6, filter: ImageFilter = "all"): string {
  const typeClause = filter === "photo" ? "filetype:bitmap" : "filetype:bitmap|drawing";
  const boosted = filter === "diagram" ? `${query.slice(0, 95)} diagram` : query.slice(0, 110);
  const q = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrnamespace: "6",
    gsrsearch: `${boosted} ${typeClause}`,
    gsrlimit: String(Math.min(16, limit * 2)),
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: "900",
    origin: "*",
  });
  return `https://commons.wikimedia.org/w/api.php?${q.toString()}`;
}

export async function searchImages(query: string, limit = 6, filter: ImageFilter = "all"): Promise<FoundImage[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const res = await fetch(commonsUrl(q, limit, filter), { headers: { "User-Agent": "SunrootLearn/1.0 (education app)" }, signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } });
    if (!res.ok) return [];
    const parsed = parseCommons(await res.json());
    if (filter === "photo") return parsed.filter((x) => !/\.svg(\?|$)/i.test(x.url)).slice(0, limit);
    return parsed.slice(0, limit);
  } catch {
    return [];
  }
}
