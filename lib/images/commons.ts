/** Finds freely licensed pictures on Wikimedia Commons (diagrams, parts, anatomy, equipment) to show next to a lesson. */

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
    const meta = (info.extmetadata || {}) as Record<string, { value?: unknown }>;
    out.push({
      idx: Number(p.index) || 99,
      url: url as string,
      page: typeof info.descriptionurl === "string" && info.descriptionurl.startsWith("https://commons.wikimedia.org/") ? info.descriptionurl : "https://commons.wikimedia.org/",
      title: strip(String(p.title || "").replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "")),
      author: strip(meta.Artist?.value) || "Unknown author",
      license: strip(meta.LicenseShortName?.value) || "See source",
      width: Number(info.thumbwidth || info.width) || 0,
      height: Number(info.thumbheight || info.height) || 0,
    });
  }
  return out.sort((a, b) => a.idx - b.idx).map(({ idx: _i, ...rest }) => (void _i, rest));
}

export function commonsUrl(query: string, limit = 6): string {
  const q = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrnamespace: "6",
    gsrsearch: `${query.slice(0, 120)} filetype:bitmap|drawing`,
    gsrlimit: String(Math.min(12, limit * 2)),
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    iiurlwidth: "900",
    origin: "*",
  });
  return `https://commons.wikimedia.org/w/api.php?${q.toString()}`;
}

export async function searchImages(query: string, limit = 6): Promise<FoundImage[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const res = await fetch(commonsUrl(q, limit), { headers: { "User-Agent": "SunrootLearn/1.0 (education app)" }, signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } });
    if (!res.ok) return [];
    return parseCommons(await res.json()).slice(0, limit);
  } catch {
    return [];
  }
}
