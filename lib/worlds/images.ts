/**
 * Pictures from the web for "what is this?" questions (a patient with jaundice, a rash, a specimen). Only Wikimedia Commons,
 * only openly licensed files, nothing that looks graphic, and the student approves each one before it is used. They are
 * labelled as web pictures, never as her notes (R1).
 */
export interface ImageCandidate {
  title: string;
  /** a 640px thumbnail on upload.wikimedia.org */
  thumbUrl: string;
  pageUrl: string;
  license: string;
  author: string;
  width: number;
  height: number;
}

/** Words in a file's title or description that mean "skip it": graphic injuries, nudity, procedures in progress. */
export const GRAPHIC = /blood|bleed|wound|gore|gory|corpse|cadaver|dead|death|nude|naked|genital|breast|nipple|surgery|surgical|operation|graphic|abuse|injur|burn|ulcer|gangrene|amputat|fetus|foetus|feces|faeces|vomit|autops|dissect|mutilat|trauma|stab|gunshot|bruis|laceration|necro|explicit|sexual/i;

const OPEN_LICENSE = /^(cc0|cc[- ]by(?:[- ]sa)?(?:[- ]\d(?:\.\d)?)?|public domain|pd[- ]|no restrictions)/i;
export const isOpenLicense = (l: string): boolean => OPEN_LICENSE.test(l.trim());

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();

type CommonsPage = { title?: string; imageinfo?: Array<{ thumburl?: string; thumbwidth?: number; thumbheight?: number; descriptionurl?: string; mime?: string; extmetadata?: Record<string, { value?: string }> }> };

export function parseCommons(json: unknown): ImageCandidate[] {
  const pages = Object.values(((json as { query?: { pages?: Record<string, CommonsPage> } } | null)?.query?.pages ?? {}) as Record<string, CommonsPage>);
  const out: ImageCandidate[] = [];
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (!info?.thumburl || !/^image\/(jpeg|png)$/.test(info.mime ?? "")) continue;
    if (!info.thumburl.startsWith("https://upload.wikimedia.org/")) continue;
    const meta = info.extmetadata ?? {};
    const license = stripHtml(meta.LicenseShortName?.value ?? "");
    if (!license || !isOpenLicense(license)) continue;
    const text = `${p.title ?? ""} ${stripHtml(meta.ImageDescription?.value ?? "")} ${stripHtml(meta.Categories?.value ?? "")}`;
    if (GRAPHIC.test(text)) continue;
    out.push({
      title: (p.title ?? "").replace(/^File:/, "").replace(/\.[a-z]+$/i, ""),
      thumbUrl: info.thumburl,
      pageUrl: info.descriptionurl ?? "https://commons.wikimedia.org/",
      license,
      author: stripHtml(meta.Artist?.value ?? "Unknown author").slice(0, 80),
      width: info.thumbwidth ?? 640,
      height: info.thumbheight ?? 480,
    });
  }
  return out;
}

/** Prefers pictures that are at least a decent size and not wildly wide. */
export function pickBest(c: ImageCandidate[]): ImageCandidate | null {
  return [...c].filter((x) => x.width >= 300 && x.width / Math.max(1, x.height) < 2.5).sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null;
}

export async function searchCommons(term: string, fetchImpl: typeof fetch = fetch): Promise<ImageCandidate[]> {
  const q = term.replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (q.length < 3) return [];
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=10&gsrsearch=${encodeURIComponent(`${q} filetype:bitmap`)}&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=640`;
  try {
    const res = await fetchImpl(url, { headers: { "User-Agent": "SunRootWorlds/1.0 (educational study aid)" }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    return parseCommons(await res.json());
  } catch {
    return [];
  }
}

/** Facts a picture can sensibly cue: short terms for what is seen (signs, named structures, specimens). */
export function pictureTerm(u: { type: string; answer: string; extra?: Record<string, string> }): string | null {
  if (!["sign_symptom", "classification", "vocab", "example"].includes(u.type)) return null;
  const a = u.answer.trim().replace(/[.]+$/, "");
  const words = a.split(/\s+/).length;
  if (words < 1 || words > 3 || a.length < 4) return null;
  return a;
}
