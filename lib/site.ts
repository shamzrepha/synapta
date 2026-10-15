/**
 * Public site identity, used for SEO metadata, robots, sitemap and structured data.
 * The URL comes from NEXT_PUBLIC_APP_URL; the fallback is the live deployment.
 */
export const SITE_NAME = "Sunroot Learning";
export const SITE_ALT_NAME = "SunrootLearning";
export const SITE_TAGLINE = "Interactive Labs, Adaptive Practice and AI Study Help";
export const SITE_DESCRIPTION =
  "Study smarter with interactive physics and electronics labs, adaptive practice, AI help on your own notes and live quiz challenges.";

const FALLBACK_URL = "https://synapta-zeta.vercel.app";

export function getSiteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL || "").trim() || FALLBACK_URL;
  return raw.replace(/\/+$/, "");
}
