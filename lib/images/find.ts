import { searchImages, isAllowedImageUrl } from "@/lib/images/commons";

/**
 * Finds pictures that really show the thing, not just something nearby. Order of trust:
 *  1. the lead picture of the exact Wikipedia article (the AI names the article; the picture is the one editors chose for it),
 *  2. Wikimedia Commons files whose title names the thing,
 *  3. Openverse (openly licensed photos from many sources) whose title names the thing.
 * A picture whose title does not mention the thing is dropped, so a "close enough" picture never slips in.
 */
export interface PickedImage {
  url: string;
  page: string;
  title: string;
  author: string;
  license: string;
  source: "wikipedia" | "commons" | "openverse";
}

const UA = { "User-Agent": "SunrootLearn/1.0 (education app)" };
const STOP = new Set("the a an of and or in on for to with from by at as is are".split(" "));

export const words = (s: string): string[] => (String(s || "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length > 1 && !STOP.has(w));

/** 0..1: how much of the thing's name appears in the picture's title/description. */
export function titleMatch(term: string, text: string): number {
  const t = words(term);
  if (t.length === 0) return 0;
  const have = new Set(words(text));
  // allow simple plurals / suffixes ("diodes" for "diode")
  const hit = t.filter((w) => have.has(w) || [...have].some((h) => h.length > 3 && (h.startsWith(w) || w.startsWith(h)))).length;
  return hit / t.length;
}

const ok = async (url: string): Promise<unknown | null> => {
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(6000), next: { revalidate: 86400 } });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
};

async function wikipediaLead(title: string): Promise<PickedImage | null> {
  const j = (await ok(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}?redirect=true`)) as {
    type?: string;
    title?: string;
    thumbnail?: { source?: string };
    originalimage?: { source?: string; width?: number };
    content_urls?: { desktop?: { page?: string } };
  } | null;
  if (!j || j.type === "disambiguation") return null;
  // a 960px copy is sharp enough and light to load
  const src = j.thumbnail?.source ? j.thumbnail.source.replace(/\/\d+px-/, "/960px-") : j.originalimage?.source;
  if (!isAllowedImageUrl(src)) return null;
  return { url: src, page: j.content_urls?.desktop?.page || "https://en.wikipedia.org/", title: j.title || title, author: "Wikipedia contributors", license: "see article", source: "wikipedia" };
}

async function openverse(query: string): Promise<PickedImage[]> {
  const j = (await ok(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(query.slice(0, 100))}&page_size=10&mature=false&license_type=commercial`)) as {
    results?: Array<{ url?: string; thumbnail?: string; title?: string; creator?: string; license?: string; license_version?: string; foreign_landing_url?: string; tags?: Array<{ name?: string }> }>;
  } | null;
  const out: PickedImage[] = [];
  for (const r of j?.results || []) {
    const url = r.thumbnail || r.url;
    if (typeof url !== "string" || !url.startsWith("https://")) continue;
    out.push({
      url,
      page: r.foreign_landing_url || "https://openverse.org/",
      title: [r.title, ...(r.tags || []).slice(0, 5).map((t) => t.name)].filter(Boolean).join(" "),
      author: r.creator || "Unknown author",
      license: `${(r.license || "").toUpperCase()} ${r.license_version || ""}`.trim() || "open licence",
      source: "openverse",
    });
  }
  return out;
}

export async function findBestImages(opts: { term: string; wikipediaTitle?: string; imageQuery?: string; limit?: number }): Promise<PickedImage[]> {
  const term = opts.term.trim();
  const q = (opts.imageQuery || term).trim();
  const [lead, commons, ov] = await Promise.all([
    wikipediaLead(opts.wikipediaTitle || term),
    searchImages(q, 6).catch(() => []),
    openverse(q).catch(() => []),
  ]);
  const scored: Array<{ img: PickedImage; score: number }> = [];
  if (lead) scored.push({ img: lead, score: 2 + titleMatch(term, `${lead.title} ${opts.wikipediaTitle || ""}`) });
  for (const c of commons) {
    const m = titleMatch(term, c.title);
    if (m >= 0.5) scored.push({ img: { url: c.url, page: c.page, title: c.title, author: c.author, license: c.license, source: "commons" }, score: 1 + m });
  }
  for (const o of ov) {
    const m = titleMatch(term, o.title);
    if (m >= 0.6) scored.push({ img: o, score: m });
  }
  const seen = new Set<string>();
  return scored
    .sort((a, b) => b.score - a.score)
    .filter((s) => (seen.has(s.img.url) ? false : (seen.add(s.img.url), true)))
    .slice(0, opts.limit ?? 5)
    .map((s) => s.img);
}
