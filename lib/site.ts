/**
 * Public site identity, used for SEO metadata, robots, sitemap and structured data.
 * The URL comes from NEXT_PUBLIC_APP_URL; the fallback is the live deployment.
 */
export const SITE_NAME = "Sunroot Learning";
export const SITE_ALT_NAME = "SunrootLearn";
export const SITE_ALIASES = ["Sunroot", "SunrootLearn", "Sunrootlearn", "Sunroot Learning", "Synapta"];
export const SITE_TAGLINE = "AI Study Help for Any Subject: Notes, Interactive Lessons and Labs";
export const SITE_DESCRIPTION =
  "Study any subject smarter: upload your notes (even handwritten photos), get clean notes and interactive lessons, adaptive practice and AI help, plus virtual labs for science and engineering.";

export const FOUNDER_NAME = "Udeakpu Yahnomnso Shamaryah";
export const FOUNDER_TITLE = "Founder & Chief Executive Officer (CEO)";
/** Other ways the founder's name is written, so search engines and AI assistants connect them to one person. */
export const FOUNDER_ALT_NAMES = ["Shamaryah Udeakpu", "Shamaryah Rephan", "Yahnomnso Shamaryah Udeakpu", "Shamaryah Yahnomnso Udeakpu", "Udeakpu Shamaryah"];
export const FOUNDER_GITHUB = "https://github.com/shamzrepha";
/** Profiles that belong to the founder. Only add a link here once the profile itself links back to https://sunrootlearn.com. */
export const FOUNDER_SAME_AS = [FOUNDER_GITHUB];
export const FOUNDER_PATH = "/founder";
export const FOUNDER_KNOWS_ABOUT = ["Educational technology", "Artificial intelligence", "Software engineering", "STEM education", "Web development"];

const FALLBACK_URL = "https://sunrootlearn.com";

export function getSiteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL || "").trim() || FALLBACK_URL;
  return raw.replace(/\/+$/, "");
}
