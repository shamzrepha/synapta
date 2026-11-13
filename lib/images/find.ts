import { searchImages, isAllowedImageUrl, type ImageFilter } from "@/lib/images/commons";

/**
 * Finds pictures that really show the thing, not just something nearby. Order of trust:
 *  1. the pictures inside the exact Wikipedia article (the AI names the article; editors put labelled diagrams and photos there, each
 *     with a caption we can check against the word),
 *  2. Wikimedia Commons files whose title names the thing,
 *  3. Openverse (openly licensed photos from many sources) whose title names the thing,
 *  4. optionally, a SearXNG metasearch server you run (set SEARXNG_URL) for pictures from textbooks and sites across the web, shown with a
 *     link back to where each one came from.
 * A picture whose title does not mention the thing is dropped, so a "close enough" picture never slips in.
 */
export interface PickedImage {
  url: string;
  page: string;
  title: string;
  author: string;
  license: string;
  source: "wikipedia" | "article" | "commons" | "openverse" | "web";
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
    thumbnail?: { source?: string; width?: number; height?: number };
    originalimage?: { source?: string; width?: number };
    content_urls?: { desktop?: { page?: string } };
  } | null;
  if (!j || j.type === "disambiguation") return null;
  // very wide or very tall lead pictures (banners, panoramas, scans) read as odd in a small card
  const w = j.thumbnail?.width;
  const h = j.thumbnail?.height;
  if (w && h && (w / h > 2.6 || h / w > 2.2)) return null;
  // a 960px copy is sharp enough and light to load
  const src = j.thumbnail?.source ? j.thumbnail.source.replace(/\/\d+px-/, "/960px-") : j.originalimage?.source;
  if (!isAllowedImageUrl(src)) return null;
  return { url: src, page: j.content_urls?.desktop?.page || "https://en.wikipedia.org/", title: j.title || title, author: "Wikipedia contributors", license: "see article", source: "wikipedia" };
}

const NOT_A_FIGURE_RE = /(commons-logo|wikimedia|wikipedia-logo|wikiquote|wikisource|wikibooks|wiktionary|question[_ ]book|ambox|edit-clear|portal|icon|symbol|flag_of|speaker_icon|padlock|stub|disambig|nuvola|crystal_clear|red_pencil|searchtool|folder|increase|decrease|steady|\bogg\b|\.ogv|\.webm|\.mp3|\.pdf)/i;

const cleanCaption = (s: unknown) =>
  String(s ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);

interface MediaItem {
  title?: string;
  type?: string;
  leadImage?: boolean;
  caption?: { text?: string };
  srcset?: Array<{ src?: string; scale?: string }>;
}

/** The pictures inside one Wikipedia article, with their captions. This is where the labelled anatomy plates and textbook diagrams live. */
export async function wikipediaMedia(title: string): Promise<Array<PickedImage & { caption: string; lead: boolean }>> {
  const j = (await ok(`https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(title.replace(/ /g, "_"))}`)) as { items?: MediaItem[] } | null;
  const out: Array<PickedImage & { caption: string; lead: boolean }> = [];
  for (const it of j?.items ?? []) {
    if (it.type !== "image" || !it.title || NOT_A_FIGURE_RE.test(it.title)) continue;
    const set = it.srcset ?? [];
    const raw = set[set.length - 1]?.src || set[0]?.src;
    if (!raw) continue;
    const src = (raw.startsWith("//") ? `https:${raw}` : raw).replace(/\?.*$/, "");
    if (!isAllowedImageUrl(src)) continue;
    const file = it.title.replace(/^File:/, "");
    const caption = cleanCaption(it.caption?.text);
    out.push({
      url: src,
      page: `https://commons.wikimedia.org/wiki/${encodeURIComponent(it.title.replace(/ /g, "_"))}`,
      title: caption || file.replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " "),
      author: "Wikipedia contributors",
      license: "see file page",
      source: "article",
      caption,
      lead: !!it.leadImage,
    });
  }
  return out;
}

/** The article the word is about, when the AI did not name one: Wikipedia's own search picks it. */
async function wikipediaArticleFor(term: string, topic?: string): Promise<string | null> {
  // the topic breaks ties between meanings ("ventricles" in a heart topic is not the brain's)
  const asks = topic ? [`${term} ${words(topic)[0] || ""}`.trim(), term] : [term];
  for (const ask of asks) {
    const j = (await ok(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(ask.slice(0, 90))}&limit=1&namespace=0&format=json&origin=*`)) as [string, string[]] | null;
    if (Array.isArray(j) && Array.isArray(j[1]) && j[1][0]) return j[1][0];
  }
  return null;
}

/**
 * Pictures from across the web through a SearXNG server (open source metasearch: https://github.com/searxng/searxng). It is only used
 * when SEARXNG_URL is set, and its pictures are shown as links to their source with "check the source" licensing, never as ours.
 */
async function searxng(query: string): Promise<PickedImage[]> {
  const base = (process.env.SEARXNG_URL || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^/\s]+/.test(base)) return [];
  const j = (await ok(`${base}/search?q=${encodeURIComponent(query.slice(0, 120))}&categories=images&format=json&safesearch=1`)) as {
    results?: Array<{ img_src?: string; thumbnail_src?: string; title?: string; url?: string; author?: string; source?: string; engine?: string }>;
  } | null;
  const out: PickedImage[] = [];
  for (const r of j?.results ?? []) {
    const url = r.img_src || r.thumbnail_src;
    if (typeof url !== "string" || !/^https:\/\/[^/\s]+\//.test(url) || url.length > 800 || /^https:\/\/(localhost|127\.|10\.|192\.168\.)/.test(url)) continue;
    out.push({ url, page: typeof r.url === "string" && r.url.startsWith("http") ? r.url : url, title: cleanCaption(r.title), author: cleanCaption(r.author || r.source || r.engine) || "the web", license: "check the source", source: "web" });
  }
  return out.slice(0, 12);
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

  const articleTitle = opts.wikipediaTitle || (await wikipediaArticleFor(term, topic).catch(() => null)) || term;
  const [lead, media, commons, ov, web] = await Promise.all([
    wikipediaLead(articleTitle),
    wikipediaMedia(articleTitle).catch(() => []),
    searchImages(q, 10, filter).catch(() => []),
    filter === "diagram" ? Promise.resolve([]) : openverse(queryWithContext).catch(() => []),
    searxng(`${queryWithContext}${filter === "diagram" ? " diagram" : ""}`).catch(() => []),
  ]);

  const matchBest = (title: string) => {
    const tScore = titleMatch(term, title);
    const qScore = q && q.toLowerCase() !== term.toLowerCase() ? titleMatch(q, title) * 0.92 : 0;
    return Math.max(tScore, qScore);
  };

  const contextBoost = (title: string) => (topic ? titleMatch(topic, title) * 0.45 : 0);
  // a picture that shares nothing with the topic is probably another meaning of the word (the brain's ventricles in a heart topic)
  const offTopic = (title: string) => (topicWords.length > 0 && titleMatch(topic, title) === 0 ? 0.3 : 0);
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
  // pictures from inside the article: the caption must name the thing (or the article is about it and the picture is its lead)
  for (const a of media) {
    if (isNoisyImage(a.title, term)) continue;
    const svg = isSvg(a.url);
    if (filter === "photo" && svg) continue;
    const m = matchBest(`${a.caption} ${a.title}`);
    if (m < 0.5 && !(a.lead && m > 0)) continue;
    const diagBoost = filter === "diagram" ? (svg || DIAGRAM_RE.test(a.title) || DIAGRAM_RE.test(a.url) ? 0.9 : -0.2) : 0;
    scored.push({ img: { url: a.url, page: a.page, title: a.title, author: a.author, license: a.license, source: "article" }, score: 1.9 + m + contextBoost(a.title) + diagBoost });
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
      score: 1 + m + contextBoost(c.title) + diagBoost - offTopic(c.title),
    });
  }
  for (const o of ov) {
    if (isNoisyImage(o.title, term)) continue;
    if (filter === "photo" && isSvg(o.url)) continue;
    const m = matchBest(o.title);
    if (m >= 0.55) scored.push({ img: o, score: m + contextBoost(o.title) - offTopic(o.title) });
  }

  // pictures from the open web only when they clearly name the thing, and always after the pictures we can vouch for
  for (const w of web) {
    if (isNoisyImage(w.title, term)) continue;
    if (filter === "photo" && isSvg(w.url)) continue;
    const m = matchBest(w.title);
    if (m >= 0.7) scored.push({ img: w, score: m * 0.9 + contextBoost(w.title) });
  }

  const seen = new Set<string>();
  const seenFile = new Set<string>();
  const fileKey = (u: string) => (u.split("/").filter((p) => p && !/^\d+px-/.test(p)).slice(-1)[0] || u).toLowerCase();
  return scored
    .sort((a, b) => b.score - a.score)
    .filter((entry) => (seen.has(entry.img.url) ? false : (seen.add(entry.img.url), true)))
    // the same file reached through the article, Commons and Openverse is one picture
    .filter((entry) => (seenFile.has(fileKey(entry.img.url)) ? false : (seenFile.add(fileKey(entry.img.url)), true)))
    .slice(0, opts.limit ?? 6)
    .map((entry) => entry.img);
}
