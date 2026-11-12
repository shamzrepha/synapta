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
export const FOUNDER_PORTFOLIO_URL = "https://github.com/shamzrepha/portfolio";
export const FOUNDER_GITHUB_URL = "https://github.com/shamzrepha";
export const PROJECT_REPO_URL = "https://github.com/shamzrepha/synapta";

const FALLBACK_URL = "https://sunrootlearn.vercel.app";

export function getSiteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL || "").trim() || FALLBACK_URL;
  return raw.replace(/\/+$/, "");
}
