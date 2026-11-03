/**
 * Public site identity, used for SEO metadata, robots, sitemap and structured data.
 * The URL comes from NEXT_PUBLIC_APP_URL; the fallback is the live deployment.
 */
export const SITE_NAME = "Sunroot Learning";
export const SITE_ALT_NAME = "SunrootLearning";
export const SITE_TAGLINE = "AI Study Help for Any Subject: Notes, Interactive Lessons and Labs";
export const SITE_DESCRIPTION =
  "Study any subject smarter: upload your notes (even handwritten photos), get clean notes and interactive lessons, adaptive practice and AI help, plus virtual labs for science and engineering.";

const FALLBACK_URL = "https://synapta-zeta.vercel.app";

export function getSiteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL || "").trim() || FALLBACK_URL;
  return raw.replace(/\/+$/, "");
}
