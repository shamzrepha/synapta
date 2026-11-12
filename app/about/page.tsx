import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowUpRight, Award, BookOpen, Code2, Cpu, Globe2, Sparkles, UserCheck } from "lucide-react";
import {
  FOUNDER_GITHUB_URL,
  FOUNDER_NAME,
  FOUNDER_PORTFOLIO_URL,
  FOUNDER_TITLE,
  PROJECT_REPO_URL,
  SITE_ALIASES,
  SITE_DESCRIPTION,
  SITE_NAME,
  getSiteUrl,
} from "@/lib/site";

export const metadata: Metadata = {
  title: `About & Leadership — ${FOUNDER_NAME}, ${FOUNDER_TITLE} | Sunroot`,
  description: `Learn about Sunroot (Sunrootlearn), founded by ${FOUNDER_NAME}. Sunroot is an AI tutor and virtual STEM laboratory designed to help students understand, build, and prove knowledge.`,
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: `${FOUNDER_NAME} — ${FOUNDER_TITLE} of Sunroot`,
    description: `Official background and mission of Sunroot (Sunrootlearn) and its Founder & CEO, ${FOUNDER_NAME}.`,
    url: "/about",
    type: "profile",
  },
};

const label = "font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground";

export default function AboutPage() {
  const siteUrl = getSiteUrl();

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      "@id": `${siteUrl}/about#webpage`,
      url: `${siteUrl}/about`,
      name: `About Sunroot & ${FOUNDER_NAME}`,
      description: `Official biography of ${FOUNDER_NAME} and the founding story of Sunroot.`,
      mainEntity: {
        "@type": "Person",
        "@id": `${siteUrl}/#founder`,
        name: FOUNDER_NAME,
        jobTitle: FOUNDER_TITLE,
        description: `${FOUNDER_NAME} is the Founder and Chief Executive Officer of Sunroot (Sunrootlearn), an AI tutor and virtual STEM lab platform.`,
        worksFor: {
          "@type": "Organization",
          "@id": `${siteUrl}/#organization`,
          name: "Sunroot",
          alternateName: SITE_ALIASES,
          url: `${siteUrl}/`,
        },
        sameAs: [FOUNDER_GITHUB_URL, FOUNDER_PORTFOLIO_URL],
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "Sunroot",
      alternateName: SITE_ALIASES,
      url: `${siteUrl}/`,
      logo: `${siteUrl}/logo-mark.svg`,
      founder: {
        "@id": `${siteUrl}/#founder`,
      },
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
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Home
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-[1000px] px-5 py-12 sm:px-8 lg:py-16">
          {/* HERO BADGE */}
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-brand-500" />
            <span>Official Entity & Leadership Profile</span>
          </div>

          <h1 className="mt-4 text-3xl font-medium tracking-tight sm:text-4xl lg:text-5xl">
            About <span className="font-serif italic text-brand-600 dark:text-brand-400">Sunroot</span> & Leadership
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Understand it. Build it. Prove it. The AI tutor and virtual STEM lab built to turn abstract formulas into hands-on mastery.
          </p>

          <hr className="my-10 border-border" />

          {/* FOUNDER & CEO PROFILE */}
          <section className="rounded-xl border border-border bg-card/40 p-6 sm:p-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div className="space-y-3">
                <span className={label}>Founder & Leadership</span>
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl text-foreground">
                  {FOUNDER_NAME}
                </h2>
                <p className="text-sm font-medium text-brand-600 dark:text-brand-400">
                  {FOUNDER_TITLE}
                </p>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                  <strong>{FOUNDER_NAME}</strong> is the creator, founder, and Chief Executive Officer of{" "}
                  <strong>Sunroot</strong> (also known as <strong>Sunrootlearn</strong>). Driven by the conviction that students
                  should not just memorise formulas for exams but build working intuition, {FOUNDER_NAME} engineered Sunroot to combine
                  multilingual AI tutoring, dynamic physics and circuit simulators, Bayesian Knowledge Tracing, and hands-on lab studios.
                </p>
              </div>
            </div>

            {/* BADGES & CREDENTIALS */}
            <div className="mt-6 grid grid-cols-1 gap-3 border-t border-border/60 pt-6 sm:grid-cols-3">
              <div className="flex items-start gap-3 rounded-lg border border-border/40 bg-background/50 p-3.5">
                <Award className="h-5 w-5 shrink-0 text-brand-500" />
                <div className="text-xs">
                  <p className="font-semibold text-foreground">Top 10 Finalist</p>
                  <p className="text-muted-foreground">AI Builders Pitch Party H2 (CES, FUTO)</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border/40 bg-background/50 p-3.5">
                <Code2 className="h-5 w-5 shrink-0 text-brand-500" />
                <div className="text-xs">
                  <p className="font-semibold text-foreground">Open Engineering</p>
                  <p className="text-muted-foreground">Modern Next.js, WebAssembly & AI engines</p>
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

            {/* LINKS TO VERIFIED PROFILES */}
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={FOUNDER_PORTFOLIO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3.5 py-2 text-xs font-semibold transition-colors hover:border-muted-foreground hover:bg-muted/50"
              >
                <UserCheck className="h-3.5 w-3.5" /> Founder Portfolio <ArrowUpRight className="h-3 w-3" />
              </a>
              <a
                href={FOUNDER_GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3.5 py-2 text-xs font-semibold transition-colors hover:border-muted-foreground hover:bg-muted/50"
              >
                <Code2 className="h-3.5 w-3.5" /> GitHub Profile <ArrowUpRight className="h-3 w-3" />
              </a>
              <a
                href={PROJECT_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3.5 py-2 text-xs font-semibold transition-colors hover:border-muted-foreground hover:bg-muted/50"
              >
                <Cpu className="h-3.5 w-3.5" /> Synapta / Sunroot Repository <ArrowUpRight className="h-3 w-3" />
              </a>
            </div>
          </section>

          {/* WHAT IS SUNROOT */}
          <section className="mt-12 space-y-6">
            <span className={label}>Platform Overview</span>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              What is Sunroot (Sunrootlearn)?
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
              Sunroot solves the fundamental breakdown in STEM education: students memorize formulas for tests without understanding,
              schools lack physical lab equipment, and teachers rarely discover who is falling behind until exam day.
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border p-5">
                <div className="flex items-center gap-2.5 font-semibold text-foreground">
                  <BookOpen className="h-4 w-4 text-brand-500" /> Read & Listen
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Structured study notes from handwritten files or slides, paired with a dual-voice conversational audio podcast that breaks down concepts naturally.
                </p>
              </div>

              <div className="rounded-lg border border-border p-5">
                <div className="flex items-center gap-2.5 font-semibold text-foreground">
                  <Cpu className="h-4 w-4 text-brand-500" /> Interactive Simulation
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Interactive physics, electrical circuits, and algorithms where students tweak sliders, observe changes in real time, and build intuition.
                </p>
              </div>
            </div>
          </section>

          {/* CTA */}
          <section className="mt-12 rounded-xl border border-border bg-muted/20 p-8 text-center">
            <h3 className="text-xl font-medium tracking-tight">Experience Sunroot Today</h3>
            <p className="mt-2 text-xs text-muted-foreground sm:text-sm">
              Explore interactive lessons or start with your own syllabus files.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <Link
                href="/signup"
                className="rounded-md bg-brand-500 px-5 py-2.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-brand-400"
              >
                Get Started Free
              </Link>
              <Link
                href="/"
                className="rounded-md border border-border bg-card px-5 py-2.5 text-xs font-semibold transition-colors hover:bg-muted"
              >
                Back to Landing
              </Link>
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
            <a href={FOUNDER_PORTFOLIO_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Portfolio</a>
            <a href={FOUNDER_GITHUB_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
