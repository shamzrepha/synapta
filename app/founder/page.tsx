import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowUpRight, Award, Code2, ExternalLink } from "lucide-react";
import { FOUNDER_PROJECTS, founderPerson, organizationNode } from "@/lib/founder";
import { FOUNDER_ALT_NAMES, FOUNDER_GITHUB, FOUNDER_LINKEDIN, FOUNDER_NAME, FOUNDER_PATH, FOUNDER_TITLE, SITE_DESCRIPTION, getSiteUrl } from "@/lib/site";

const SHORT = "Shamaryah Udeakpu";

export const metadata: Metadata = {
  title: `${SHORT} (${FOUNDER_NAME}) — Founder & CEO of Sunroot, Software Developer`,
  description: `${SHORT}, also written ${FOUNDER_NAME} or Shamaryah Rephan: founder and CEO of Sunroot (Sunrootlearn), an AI tutor and virtual STEM lab, and a software developer. Projects, recognition and links.`,
  alternates: { canonical: FOUNDER_PATH },
  openGraph: {
    title: `${SHORT} — Founder & CEO of Sunroot`,
    description: `Projects, recognition and links for ${SHORT}, founder of Sunroot (Sunrootlearn).`,
    url: FOUNDER_PATH,
    type: "profile",
    images: [{ url: "/ceo.jpg", width: 800, height: 800, alt: `${FOUNDER_NAME}, Founder & CEO of Sunroot` }],
  },
};

const label = "font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground";

export default function FounderPage() {
  const siteUrl = getSiteUrl();
  const graph = [
    {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      "@id": `${siteUrl}${FOUNDER_PATH}#webpage`,
      url: `${siteUrl}${FOUNDER_PATH}`,
      name: `${SHORT} — Founder & CEO of Sunroot`,
      mainEntity: { "@id": `${siteUrl}/#founder` },
    },
    { "@context": "https://schema.org", ...founderPerson(siteUrl) },
    { "@context": "https://schema.org", ...organizationNode(siteUrl, SITE_DESCRIPTION) },
    ...FOUNDER_PROJECTS.map((p) => ({
      "@context": "https://schema.org",
      "@type": "CreativeWork",
      name: p.name,
      url: p.url,
      description: p.summary,
      creator: { "@id": `${siteUrl}/#founder` },
    })),
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-brand-500 selection:text-slate-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, "\\u003c") }} />
      <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1000px] items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo-mark.svg" alt="Sunroot" width={28} height={28} className="h-7 w-7" priority />
            <span translate="no" className="text-[17px] font-semibold tracking-tight">Sunroot</span>
          </Link>
          <Link href="/about" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> About Sunroot
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-[1000px] px-5 py-12 sm:px-8 lg:py-16">
          <section className="flex flex-col gap-6 md:flex-row md:items-start">
            <div className="relative h-44 w-44 shrink-0 overflow-hidden rounded-2xl border-2 border-brand-500/50 shadow-lg sm:h-52 sm:w-52">
              <Image src="/ceo.jpg" alt={`${FOUNDER_NAME}, Founder & CEO of Sunroot`} fill className="object-cover object-top" priority />
            </div>
            <div className="flex-1 space-y-3">
              <span className={label}>Founder profile</span>
              <h1 className="text-3xl font-medium tracking-tight sm:text-4xl lg:text-5xl">{SHORT}</h1>
              <p className="text-sm font-medium text-brand-600 dark:text-brand-400">{FOUNDER_TITLE}, Sunroot (Sunrootlearn)</p>
              <p className="text-xs text-muted-foreground">
                Full name: {FOUNDER_NAME}. Also written as {FOUNDER_ALT_NAMES.filter((n) => n !== SHORT).slice(0, 3).join(", ")}.
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
                <strong>{SHORT}</strong> ({FOUNDER_NAME}) is the founder and Chief Executive Officer of <strong>Sunroot</strong>, also known as
                <strong> Sunrootlearn</strong>, an AI tutor and virtual STEM laboratory for students. He is a software developer who designs and builds the
                product himself, from the learning engine to the interactive simulators.
              </p>
              <div className="flex flex-wrap gap-2.5 pt-1">
                <a href={FOUNDER_GITHUB} rel="me noopener" target="_blank" className="inline-flex items-center gap-1.5 rounded-md bg-brand-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-brand-400">
                  <Code2 className="h-3.5 w-3.5" /> GitHub portfolio <ExternalLink className="h-3 w-3" />
                </a>
                <a href={FOUNDER_LINKEDIN} rel="me noopener" target="_blank" className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3.5 py-1.5 text-xs font-semibold transition-colors hover:border-muted-foreground/60">
                  LinkedIn profile <ExternalLink className="h-3 w-3" />
                </a>
                <Link href="/" className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3.5 py-1.5 text-xs font-semibold transition-colors hover:border-muted-foreground/60">
                  sunrootlearn.com <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </section>

          <section className="mt-12 space-y-3">
            <span className={label}>In short</span>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Who is {SHORT}?</h2>
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
              {SHORT} is a Nigerian founder and software developer. He is the CEO of Sunroot (Sunrootlearn), the study platform at sunrootlearn.com that turns a
              student&apos;s own notes into lessons, practice and virtual labs. He was a Top 10 finalist at the AI Builders Pitch Party H2 at the Centre for
              Entrepreneurship Studies (CES), FUTO.
            </p>
          </section>

          <section className="mt-12 space-y-4">
            <span className={label}>Projects</span>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">What he has built</h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {FOUNDER_PROJECTS.map((p) => (
                <li key={p.name} className="rounded-lg border border-border p-5">
                  <a href={p.url} className="font-semibold text-foreground hover:underline">{p.name}</a>
                  <p className="mt-1 text-xs font-medium text-brand-600 dark:text-brand-400">{p.role}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.summary}</p>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">More of his work, source code and CV are on his <a href={FOUNDER_GITHUB} rel="me noopener" target="_blank" className="font-semibold text-brand-700 hover:underline dark:text-brand-300">GitHub profile</a>.</p>
          </section>

          <section className="mt-12 space-y-3">
            <span className={label}>Recognition</span>
            <div className="flex items-start gap-3 rounded-lg border border-border bg-card/40 p-4">
              <Award className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
              <div className="text-sm">
                <p className="font-semibold">Top 10 Finalist</p>
                <p className="text-muted-foreground">AI Builders Pitch Party H2, Centre for Entrepreneurship Studies (CES), FUTO</p>
              </div>
            </div>
            <div className="relative aspect-[16/9] overflow-hidden rounded-xl border border-border">
              <Image src="/ceo-pitch.jpg" alt={`${FOUNDER_NAME} pitching Sunroot on stage at the AI Builders Pitch Party`} fill className="object-cover" />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
