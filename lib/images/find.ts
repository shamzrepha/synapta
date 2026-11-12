import { searchImages, isAllowedImageUrl, type ImageFilter } from "@/lib/images/commons";

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

const NOISE_TITLE_RE = /\b(logo|wordmark|favicon|coat of arms|flag of|signature|autograph|disambiguation|placeholder|stub|album cover|book cover|poster|seal of|locator map)\b/i;
const DIAGRAM_RE = /(diagram|schematic|cross[- ]?section|structure|labeled|anatomy|cycle|chart|circuit|pathway|illustration|vector|\.svg)/i;

function isNoisyImage(title: string, term: string): boolean {
  const m = NOISE_TITLE_RE.exec(title);
  if (!m) return false;
  return !term.toLowerCase().includes(m[1].toLowerCase());
}

export async function findBestImages(opts: {
  term: string;
  wikipediaTitle?: string;
  imageQuery?: string;
  topic?: string;
  filter?: ImageFilter;
  limit?: number;
}): Promise<PickedImage[]> {
  const term = opts.term.trim();
  const q = (opts.imageQuery || term).trim();
  const filter = opts.filter ?? "all";
  const topic = (opts.topic || "").trim();
  const topicWords = words(topic);
  const queryWithContext = topicWords.length > 0 && titleMatch(topic, q) === 0 ? `${q} ${topicWords[0]}` : q;

  const [lead, commons, ov] = await Promise.all([
    wikipediaLead(opts.wikipediaTitle || term),
    searchImages(q, 10, filter).catch(() => []),
    filter === "diagram" ? Promise.resolve([]) : openverse(queryWithContext).catch(() => []),
  ]);

  const matchBest = (title: string) => {
    const tScore = titleMatch(term, title);
    const qScore = q && q.toLowerCase() !== term.toLowerCase() ? titleMatch(q, title) * 0.92 : 0;
    return Math.max(tScore, qScore);
  };

  const contextBoost = (title: string) => (topic ? titleMatch(topic, title) * 0.45 : 0);
  const isSvg = (url: string) => /\.svg(\?|$)/i.test(url);

  const scored: Array<{ img: PickedImage; score: number }> = [];
  if (lead && !isNoisyImage(lead.title, term)) {
    const svg = isSvg(lead.url);
    if (!(filter === "photo" && svg)) {
      const m = matchBest(`${lead.title} ${opts.wikipediaTitle || ""}`);
      const diagBoost = filter === "diagram" && (svg || DIAGRAM_RE.test(lead.title)) ? 0.8 : 0;
      scored.push({ img: lead, score: 2 + m + contextBoost(lead.title) + diagBoost });
    }
  }
  for (const c of commons) {
    if (isNoisyImage(c.title, term)) continue;
    const svg = isSvg(c.url);
    if (filter === "photo" && svg) continue;
    const m = matchBest(c.title);
    if (m < 0.45) continue;
    const diagBoost = filter === "diagram" ? (svg || DIAGRAM_RE.test(c.title) || DIAGRAM_RE.test(c.url) ? 1.1 : -0.3) : 0;
    scored.push({
      img: { url: c.url, page: c.page, title: c.title, author: c.author, license: c.license, source: "commons" },
      score: 1 + m + contextBoost(c.title) + diagBoost,
    });
  }
  for (const o of ov) {
    if (isNoisyImage(o.title, term)) continue;
    if (filter === "photo" && isSvg(o.url)) continue;
    const m = matchBest(o.title);
    if (m >= 0.55) scored.push({ img: o, score: m + contextBoost(o.title) });
  }

  const seen = new Set<string>();
  return scored
    .sort((a, b) => b.score - a.score)
    .filter((entry) => (seen.has(entry.img.url) ? false : (seen.add(entry.img.url), true)))
    .slice(0, opts.limit ?? 6)
    .map((entry) => entry.img);
}
