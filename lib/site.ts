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
export const FOUNDER_ALIASES = [
  "Shamaryah Udeakpu",
  "Shamaryah Rephan",
  "Shamz Repha",
  "Yahnomnso Shamaryah",
  "Shamz",
  "Udeakpu Yahnomnso Shamaryah",
];
export const FOUNDER_GITHUB = "https://github.com/shamzrepha";
export const FOUNDER_ALMA_MATER = "Federal University of Technology Owerri";
export const FOUNDER_ALMA_MATER_SHORT = "FUTO";
export const FOUNDER_KNOWS_ABOUT = [
  "Artificial Intelligence",
  "Full-Stack Software Engineering",
  "STEM Education",
  "EdTech",
  "WebAssembly",
  "Next.js",
  "Machine Learning",
];

const FALLBACK_URL = "https://sunrootlearn.com";

export function getSiteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL || "").trim() || FALLBACK_URL;
  return raw.replace(/\/+$/, "");
}

export function getFounderSchema(siteUrl: string) {
  return {
    "@type": "Person",
    "@id": `${siteUrl}/#founder`,
    name: FOUNDER_NAME,
    alternateName: FOUNDER_ALIASES,
    jobTitle: FOUNDER_TITLE,
    image: `${siteUrl}/ceo.jpg`,
    url: `${siteUrl}/about`,
    sameAs: [FOUNDER_GITHUB],
    alumniOf: {
      "@type": "CollegeOrUniversity",
      name: FOUNDER_ALMA_MATER,
      alternateName: FOUNDER_ALMA_MATER_SHORT,
      url: "https://futo.edu.ng",
    },
    knowsAbout: FOUNDER_KNOWS_ABOUT,
    description: `${FOUNDER_NAME} (known professionally as Shamaryah Rephan, Shamaryah Udeakpu, or Shamz Repha) is the Founder & CEO of Sunroot (Sunrootlearn), software engineer, and STEM education innovator at the Federal University of Technology Owerri (FUTO).`,
    worksFor: {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "Sunroot",
      alternateName: SITE_ALIASES,
      url: `${siteUrl}/`,
    },
  };
}
