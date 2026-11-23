import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowUpRight, Award, BookOpen, Code2, Cpu, Globe2, Sparkles } from "lucide-react";
import {
  FOUNDER_NAME,
  FOUNDER_TITLE,
  FOUNDER_ALIASES,
  FOUNDER_GITHUB,
  SITE_ALIASES,
  SITE_DESCRIPTION,
  SITE_NAME,
  getFounderSchema,
  getSiteUrl,
} from "@/lib/site";

export const metadata: Metadata = {
  title: `${FOUNDER_NAME} (Shamaryah Rephan) — Founder & CEO | Sunroot`,
  description: `Official profile and biography of ${FOUNDER_NAME} (also known as Shamaryah Rephan, Shamaryah Udeakpu), Founder & CEO of Sunroot (Sunrootlearn), software developer and STEM education innovator at FUTO.`,
  alternates: {
    canonical: "/founder",
  },
  openGraph: {
    title: `${FOUNDER_NAME} (Shamaryah Rephan) — ${FOUNDER_TITLE} of Sunroot`,
    description: `Official profile, engineering portfolio, photo, and biography of ${FOUNDER_NAME} (Shamaryah Rephan / Udeakpu), Founder & CEO of Sunroot.`,
    url: "/founder",
    type: "profile",
    images: [
      {
        url: "/ceo.jpg",
        width: 800,
        height: 800,
        alt: `${FOUNDER_NAME} (Shamaryah Rephan) - Founder & CEO`,
      },
    ],
  },
};

const label = "font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground";

export default function FounderPage() {
  const siteUrl = getSiteUrl();

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      "@id": `${siteUrl}/founder#webpage`,
      url: `${siteUrl}/founder`,
      name: `${FOUNDER_NAME} — Founder & CEO Profile`,
      description: `Official ProfilePage of ${FOUNDER_NAME} (Shamaryah Rephan / Udeakpu), Founder and CEO of Sunroot.`,
      mainEntity: getFounderSchema(siteUrl),
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "Sunroot",
      alternateName: SITE_ALIASES,
      url: `${siteUrl}/`,
      logo: `${siteUrl}/logo-mark.svg`,
      description: SITE_DESCRIPTION,
      founder: {
        "@id": `${siteUrl}/#founder`,
      },
    },
    {
      ...getFounderSchema(siteUrl),
      "@context": "https://schema.org",
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-brand-500 selection:text-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />

      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1000px] items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo-mark.svg" alt="Sunroot" width={28} height={28} className="h-7 w-7" priority />
            <span translate="no" className="text-[17px] font-semibold tracking-tight">Sunroot</span>
          </Link>
          <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
            <Link href="/about" className="hover:text-foreground">About Platform</Link>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Home
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-[1000px] px-5 py-12 sm:px-8 lg:py-16">
          {/* HERO BADGE */}
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-brand-500" />
            <span>Official Founder & Leadership Entity Profile</span>
          </div>

          <h1 className="mt-4 text-3xl font-medium tracking-tight sm:text-4xl lg:text-5xl">
            {FOUNDER_NAME}
          </h1>
          <p className="mt-3 max-w-2xl text-base text-brand-600 dark:text-brand-400 font-medium sm:text-lg">
            {FOUNDER_TITLE} of <span className="font-serif italic">Sunroot</span> (Sunrootlearn)
          </p>

          <hr className="my-10 border-border" />

          {/* FOUNDER & CEO PROFILE */}
          <section className="rounded-xl border border-border bg-card/40 p-6 sm:p-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-start">
              {/* CEO PHOTO */}
              <div className="relative h-48 w-48 shrink-0 overflow-hidden rounded-2xl border-2 border-brand-500/50 shadow-lg sm:h-56 sm:w-56">
                <Image
                  src="/ceo.jpg"
                  alt={`${FOUNDER_NAME} (Shamaryah Rephan) - Founder & CEO`}
                  fill
                  className="object-cover object-top"
                  priority
                />
              </div>

              <div className="flex-1 space-y-3">
                <span className={label}>Founder, CEO & Engineer</span>
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl text-foreground">
                  {FOUNDER_NAME}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-brand-600 dark:text-brand-400">
                    {FOUNDER_TITLE}
                  </p>
                  <span className="text-xs text-muted-foreground">•</span>
                  <p className="text-xs text-muted-foreground">
                    Known as <span className="font-medium text-foreground">Shamaryah Rephan</span> / <span className="font-medium text-foreground">Shamaryah Udeakpu</span> (@shamzrepha)
                  </p>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
                  <strong>{FOUNDER_NAME}</strong> (widely known as <strong>Shamaryah Rephan</strong>, <strong>Shamaryah Udeakpu</strong>, or <strong>Shamz Repha</strong>) is the founder and Chief Executive Officer of{" "}
                  <strong>Sunroot</strong> (recognized online as <strong>Sunrootlearn</strong>). As a software developer and innovator at the <strong>Federal University of Technology Owerri (FUTO)</strong>, {FOUNDER_NAME} engineered Sunroot to transform STEM learning by pairing multilingual conversational AI tutoring with real-time interactive physics and circuit laboratories, Bayesian Knowledge Tracing, and hands-on lab studios.
                </p>

                {/* ACTIONS & PORTFOLIO */}
                <div className="pt-3 flex flex-wrap gap-2.5">
                  <a
                    href={FOUNDER_GITHUB}
                    target="_blank"
                    rel="me noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 px-3.5 py-2 text-xs font-semibold transition-colors hover:bg-zinc-800 dark:hover:bg-zinc-200 shadow-sm"
                  >
                    <Code2 className="h-3.5 w-3.5" />
                    Engineering Portfolio & CV <ArrowUpRight className="h-3 w-3" />
                  </a>
                  <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 rounded-md bg-brand-500 px-3.5 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-brand-400"
                  >
                    Visit Sunroot <ArrowUpRight className="h-3 w-3" />
                  </Link>
                  <Link
                    href="/about"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3.5 py-2 text-xs font-semibold transition-colors hover:border-muted-foreground hover:bg-muted/50"
                  >
                    About Platform <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>

            {/* BADGES & CREDENTIALS */}
            <div className="mt-8 grid grid-cols-1 gap-3 border-t border-border/60 pt-6 sm:grid-cols-4">
              <div className="flex items-start gap-3 rounded-lg border border-border/40 bg-background/50 p-3.5">
                <Award className="h-5 w-5 shrink-0 text-brand-500" />
                <div className="text-xs">
                  <p className="font-semibold text-foreground">Top 10 Finalist</p>
                  <p className="text-muted-foreground">AI Builders Pitch Party H2 (CES, FUTO)</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border/40 bg-background/50 p-3.5">
                <BookOpen className="h-5 w-5 shrink-0 text-brand-500" />
                <div className="text-xs">
                  <p className="font-semibold text-foreground">FUTO Innovator</p>
                  <p className="text-muted-foreground">Federal Univ of Tech Owerri</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border/40 bg-background/50 p-3.5">
                <Code2 className="h-5 w-5 shrink-0 text-brand-500" />
                <div className="text-xs">
                  <p className="font-semibold text-foreground">Engineering Portfolio</p>
                  <p className="text-muted-foreground">github.com/shamzrepha</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border/40 bg-background/50 p-3.5">
                <Globe2 className="h-5 w-5 shrink-0 text-brand-500" />
                <div className="text-xs">
                  <p className="font-semibold text-foreground">Multilingual Vision</p>
                  <p className="text-muted-foreground">English, Naijá, Yorùbá, Igbo, Hausa & more</p>
                </div>
              </div>
            </div>
          </section>

          {/* STAGE & PITCH EVENT SHOWCASE */}
          <section className="mt-12 rounded-xl border border-border bg-card/30 p-6 sm:p-8">
            <span className={label}>Milestone & Recognition</span>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Pitching Sunroot at AI Builder&apos;s Pitch Party
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Founder {FOUNDER_NAME} presenting Sunroot on stage as a Top 10 Finalist at the AI Builders Pitch Party H2,
              Centre for Entrepreneurship Studies (CES), FUTO.
            </p>

            <div className="mt-6 overflow-hidden rounded-xl border border-border bg-black/40 shadow-xl">
              <div className="relative aspect-[16/10] w-full sm:aspect-[16/9]">
                <Image
                  src="/ceo-pitch.jpg"
                  alt={`${FOUNDER_NAME} pitching Sunroot on stage at AI Builders Pitch Party`}
                  fill
                  className="object-cover"
                />
              </div>
              <div className="border-t border-border/60 bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{FOUNDER_NAME}</span> presenting the Sunroot platform architecture and virtual STEM lab.
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-border bg-background py-8">
        <div className="mx-auto flex max-w-[1000px] flex-col justify-between gap-4 px-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:px-8">
          <p>&copy; 2026 Sunroot Learning. Founded by {FOUNDER_NAME}.</p>
          <div className="flex gap-4">
            <Link href="/" className="hover:text-foreground">Home</Link>
            <Link href="/about" className="hover:text-foreground">About Platform</Link>
            <Link href="/founder" className="hover:text-foreground">Founder & CEO</Link>
            <a href={FOUNDER_GITHUB} target="_blank" rel="me noopener noreferrer" className="hover:text-foreground">GitHub & CV</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
