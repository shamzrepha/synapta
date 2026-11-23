import { FOUNDER_ALT_NAMES, FOUNDER_KNOWS_ABOUT, FOUNDER_NAME, FOUNDER_PATH, FOUNDER_SAME_AS, FOUNDER_TITLE, SITE_ALIASES } from "@/lib/site";

/** Projects shown on the founder page and in structured data. Add a project here and it appears in both. Facts only. */
export interface FounderProject {
  name: string;
  url: string;
  summary: string;
  role: string;
}
export const FOUNDER_PROJECTS: FounderProject[] = [
  {
    name: "Sunroot (Sunrootlearn)",
    url: "https://sunrootlearn.com",
    summary: "An AI tutor and virtual STEM lab: study notes, interactive lessons, adaptive practice and simulators from a student's own material.",
    role: "Founder and CEO; designs and builds the product",
  },
  {
    name: "VeriShield NG",
    url: "https://github.com/shamzrepha/verishield-ng",
    summary: "Accessible Civic AI PWA, Shared Forensics Core & Safety Shield (#AI4Elections).",
    role: "Lead Developer",
  },
  {
    name: "EcoVital",
    url: "https://github.com/shamzrepha/ecovital",
    summary: "Air quality sensory diagnostics and conversational audio health advisory system (AI Builders Pitch Party, FUTO).",
    role: "Creator and Lead Engineer",
  },
  {
    name: "CogniTwin AI",
    url: "https://github.com/shamzrepha/cognitwin",
    summary: "Cognitive Digital Twin LMS & Bayesian Knowledge Tracing Engine.",
    role: "Architect & Developer",
  },
];

/** One Person description, reused by every page so the same facts and the same @id are repeated everywhere. */
export function founderPerson(siteUrl: string) {
  return {
    "@type": "Person",
    "@id": `${siteUrl}/#founder`,
    name: FOUNDER_NAME,
    alternateName: FOUNDER_ALT_NAMES,
    jobTitle: FOUNDER_TITLE,
    description: `${FOUNDER_NAME}, also written Shamaryah Udeakpu, is the founder and CEO of Sunroot (Sunrootlearn), an AI tutor and virtual STEM lab, and a software developer.`,
    image: `${siteUrl}/ceo.jpg`,
    url: `${siteUrl}${FOUNDER_PATH}`,
    mainEntityOfPage: `${siteUrl}${FOUNDER_PATH}`,
    sameAs: FOUNDER_SAME_AS,
    alumniOf: {
      "@type": "CollegeOrUniversity",
      name: "Federal University of Technology Owerri",
      alternateName: "FUTO",
      url: "https://futo.edu.ng",
    },
    knowsAbout: FOUNDER_KNOWS_ABOUT,
    award: "Top 10 Finalist, AI Builders Pitch Party H2, Centre for Entrepreneurship Studies (CES), FUTO",
    worksFor: { "@id": `${siteUrl}/#organization` },
    owns: { "@id": `${siteUrl}/#organization` },
  };
}

export function organizationNode(siteUrl: string, description: string) {
  return {
    "@type": "Organization",
    "@id": `${siteUrl}/#organization`,
    name: "Sunroot",
    alternateName: SITE_ALIASES,
    url: `${siteUrl}/`,
    logo: `${siteUrl}/logo-mark.svg`,
    description,
    founder: { "@id": `${siteUrl}/#founder` },
  };
}
