import { LandingButtons } from "@/components/auth/landing-buttons";
import { MobileLandingRedirect } from "@/components/auth/mobile-landing-redirect";
import { HeroEngine } from "@/components/landing/hero-engine";
import { PixelField } from "@/components/landing/pixel-field";
import { Reveal } from "@/components/landing/reveal";
import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, BookOpenText, Briefcase, Download, GraduationCap, Languages, ListChecks, MessagesSquare, Presentation, Route, School, Sprout, Users, Wrench } from "lucide-react";
import {
  FOUNDER_GITHUB_URL,
  FOUNDER_NAME,
  FOUNDER_PORTFOLIO_URL,
  FOUNDER_TITLE,
  PROJECT_REPO_URL,
  SITE_ALIASES,
  SITE_ALT_NAME,
  SITE_DESCRIPTION,
  SITE_NAME,
  getSiteUrl,
} from "@/lib/site";

const LANGS = ["English", "Naijá", "Yorùbá", "Igbo", "Hausa", "Français", "العربية", "Kiswahili"];
const SUBJECTS = ["Mathematics", "Physics", "Biology", "Law", "Medicine", "History", "Languages", "Electronics", "Accounting", "Literature", "Chemistry", "Economics", "Engineering", "Computer science"];

const STEPS = [
  { n: "01", title: "Drop in what you have", body: "A typed PDF, a scan of handwriting, a photo of the board, a Word file or slides. Sunroot reads all of them." },
  { n: "02", title: "It decides what the topic needs", body: "Maths gets worked steps and practice. Electronics gets a simulator. History gets timelines and recall. Nothing you don't need." },
  { n: "03", title: "Learn it, then prove it", body: "Short lessons, flashcards and quizzes, a tutor in your language, and a plan built from the questions you got wrong." },
];

const FEATURES = [
  { icon: BookOpenText, title: "Study notes", body: "Clean, structured notes from any file, with page references you can refine or download." },
  { icon: Presentation, title: "Teach me", body: "Step-by-step animated lessons you can pause, replay and interact with, at the speed you choose." },
  { icon: ListChecks, title: "Flashcards and quizzes", body: "Made from your own notes in one tap, with spaced repetition so it sticks." },
  { icon: MessagesSquare, title: "A tutor that speaks your language", body: "Ask in text or by voice. Answers come back in your language and point to your material." },
  { icon: Wrench, title: "Maker Studio", body: "Wire circuits, write code and run them in a simulator, then build the same thing in 3D." },
  { icon: Route, title: "How am I doing?", body: "Finds what you are stuck on from your wrong answers and gives you a short plan to fix it." },
];

const AUDIENCES = [
  { icon: School, title: "School students", body: "Turn class notes and past papers into practice before the exam." },
  { icon: GraduationCap, title: "University students", body: "Bring lecture slides and handouts; get notes, recall and a tutor." },
  { icon: Sprout, title: "Self-learners", body: "Any book, article or course PDF becomes something you can study from." },
  { icon: Briefcase, title: "Working professionals", body: "Learn a new field from the documents you already have." },
  { icon: Users, title: "Teachers and lecturers", body: "Publish a class from a syllabus file and see where students are stuck." },
];

/** A small "+" where hairlines cross: a registration mark. */
function Plus({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute z-10 h-[9px] w-[9px] ${className ?? ""}`}>
      <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-muted-foreground/60" />
      <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-muted-foreground/60" />
    </span>
  );
}

const label = "font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground";
const rail = "mx-auto w-full max-w-[1280px] border-x border-border";

export default function LandingPage() {
  const siteUrl = getSiteUrl();
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      alternateName: SITE_ALIASES,
      url: `${siteUrl}/`,
      description: SITE_DESCRIPTION,
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
        "@type": "Person",
        "@id": `${siteUrl}/#founder`,
        name: FOUNDER_NAME,
        jobTitle: FOUNDER_TITLE,
        url: `${siteUrl}/about`,
        sameAs: [FOUNDER_GITHUB_URL, FOUNDER_PORTFOLIO_URL],
      },
      sameAs: [PROJECT_REPO_URL, FOUNDER_GITHUB_URL],
    },
    {
      "@context": "https://schema.org",
      "@type": "Person",
      "@id": `${siteUrl}/#founder`,
      name: FOUNDER_NAME,
      jobTitle: FOUNDER_TITLE,
      worksFor: {
        "@id": `${siteUrl}/#organization`,
      },
      url: `${siteUrl}/about`,
      sameAs: [FOUNDER_GITHUB_URL, FOUNDER_PORTFOLIO_URL],
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-brand-500 selection:text-slate-950">
      <MobileLandingRedirect />
      <noscript>
        <style>{".reveal{opacity:1;transform:none}"}</style>
      </noscript>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />

      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo-mark.svg" alt="" width={28} height={28} className="h-7 w-7" priority />
            <span translate="no" className="text-[17px] font-semibold tracking-tight">Sunroot</span>
          </Link>
          <nav className="hidden items-center gap-8 md:flex" aria-label="Page sections">
            {[["How it works", "#how"], ["Features", "#features"], ["Who it's for", "#who"], ["Teachers", "#teachers"], ["Languages", "#languages"], ["About", "/about"]].map(([t, h]) => (
              <Link key={h} href={h} className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground">{t}</Link>
            ))}
          </nav>
          <LandingButtons />
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="relative overflow-hidden border-b border-border">
          <div className={`${rail} relative px-5 pb-0 pt-14 sm:px-8 lg:pt-20`}>
            <Plus className="-left-[5px] top-[-5px]" />
            <Plus className="-right-[5px] top-[-5px]" />
            <div className="flex flex-wrap items-center gap-3">
              <p className={label}>Study platform</p>
              <span className="rounded border border-border px-2 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-foreground">Every subject. Every student.</span>
            </div>
            <h1 className="mt-6 max-w-[16ch] text-[clamp(2.75rem,7.4vw,6.25rem)] font-medium leading-[0.98] tracking-[-0.035em] sm:max-w-none">
              Study anything.
              <br />
              Understand it <em className="whitespace-nowrap font-serif font-normal italic tracking-[-0.02em] text-brand-600 dark:text-brand-400">for real.</em>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Drop in your notes, scans or slides. Sunroot turns them into lessons, practice and a tutor that speaks your language, built for exactly what you are learning.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup" className="group inline-flex h-12 items-center gap-2 rounded-md bg-brand-500 px-6 text-sm font-semibold text-slate-950 transition-colors hover:bg-brand-400">
                Start free <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a href="#how" className="inline-flex h-12 items-center gap-2 rounded-md border border-border bg-card px-6 text-sm font-medium transition-colors hover:border-muted-foreground/60">
                See how it works
              </a>
            </div>

            {/* product frame */}
            <div className="relative mt-14 lg:mt-20">
              <div className="edge-sweep rounded-xl border border-border bg-card p-2 sm:p-3">
                <HeroEngine />
              </div>
              <Plus className="-left-[5px] -top-[5px]" />
              <Plus className="-right-[5px] -top-[5px]" />
            </div>
            <div className="relative h-24 sm:h-36">
              <PixelField className="absolute inset-x-0 bottom-0 h-full w-full" />
            </div>
          </div>
        </section>

        {/* SUBJECT STRIP */}
        <section className="border-b border-border" aria-label="Subjects people study with Sunroot">
          <div className="marquee relative overflow-hidden py-5 [mask-image:linear-gradient(to_right,transparent,#000_12%,#000_88%,transparent)]">
            <div className="marquee-track">
              {[0, 1].map((dup) => (
                <ul key={dup} aria-hidden={dup === 1 ? "true" : undefined} className="flex shrink-0 items-center">
                  {SUBJECTS.map((s) => (
                    <li key={s + dup} className="flex items-center">
                      <span className="px-6 font-mono text-[12px] uppercase tracking-[0.18em] text-muted-foreground">{s}</span>
                      <span aria-hidden="true" className="text-brand-500">/</span>
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how" className="scroll-mt-14 border-b border-border">
          <div className={`${rail} px-5 py-20 sm:px-8 lg:py-28`}>
            <Reveal className="max-w-3xl space-y-4">
              <p className={label}>How it works</p>
              <h2 className="text-[clamp(2rem,4.6vw,3.5rem)] font-medium leading-[1.04] tracking-[-0.03em]">From a pile of files to something you can actually learn from</h2>
            </Reveal>
            <ol className="mt-14 grid border-y border-border md:grid-cols-3">
              {STEPS.map((s, i) => (
                <Reveal as="li" key={s.n} delay={i * 110} className="space-y-4 border-b border-border p-6 last:border-b-0 sm:p-8 md:border-b-0 md:border-r md:last:border-r-0">
                  <span className="font-mono text-sm text-brand-600 dark:text-brand-400">{s.n}</span>
                  <h3 className="text-xl font-medium tracking-tight">{s.title}</h3>
                  <p className="text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="scroll-mt-14 border-b border-border">
          <div className={`${rail} px-5 py-20 sm:px-8 lg:py-28`}>
            <Reveal className="max-w-3xl space-y-4">
              <p className={label}>What you get</p>
              <h2 className="text-[clamp(2rem,4.6vw,3.5rem)] font-medium leading-[1.04] tracking-[-0.03em]">Everything for one topic, in one place</h2>
            </Reveal>
            <dl className="mt-14 grid border-l border-t border-border sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f, i) => (
                <Reveal key={f.title} delay={(i % 3) * 90} className="group border-b border-r border-border p-6 transition-colors duration-300 hover:bg-card sm:p-8">
                  <f.icon className="h-5 w-5 text-brand-600 transition-transform duration-500 group-hover:-translate-y-0.5 dark:text-brand-400" aria-hidden="true" />
                  <dt className="mt-8 text-lg font-medium tracking-tight">{f.title}</dt>
                  <dd className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{f.body}</dd>
                </Reveal>
              ))}
            </dl>
          </div>
        </section>

        {/* WHO IT'S FOR */}
        <section id="who" className="scroll-mt-14 border-b border-border">
          <div className={`${rail} px-5 py-20 sm:px-8 lg:py-28`}>
            <Reveal className="max-w-3xl space-y-4">
              <p className={label}>Who it&apos;s for</p>
              <h2 className="text-[clamp(2rem,4.6vw,3.5rem)] font-medium leading-[1.04] tracking-[-0.03em]">
                Built for every kind of <em className="font-serif font-normal italic text-brand-600 dark:text-brand-400">learner</em>
              </h2>
            </Reveal>
            <ul className="mt-14 grid border-t border-border sm:grid-cols-2 lg:grid-cols-5">
              {AUDIENCES.map((a, i) => (
                <Reveal as="li" key={a.title} delay={i * 80} className="space-y-3 border-b border-border p-6 sm:border-r sm:last:border-r-0 lg:border-b-0 lg:p-7">
                  <a.icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  <h3 className="text-base font-medium">{a.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{a.body}</p>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* TEACHERS */}
        <section id="teachers" className="scroll-mt-14 border-b border-border">
          <div className={`${rail} grid items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:py-28`}>
            <Reveal className="space-y-6">
              <p className={label}>For teachers and lecturers</p>
              <h2 className="text-[clamp(2rem,4.2vw,3.25rem)] font-medium leading-[1.05] tracking-[-0.03em]">Publish a class from your syllabus file</h2>
              <ul className="space-y-4 text-[15px] leading-relaxed text-muted-foreground">
                <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" /> Upload your syllabus or lecture notes as a PDF, scan, Word file or slides. Sunroot maps it into topics.</li>
                <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" /> Review and edit the lessons, practice questions and flashcards before students see them.</li>
                <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" /> See which topics each student has mastered and where the class is stuck.</li>
              </ul>
              <Link href="/signup" className="group inline-flex h-11 items-center gap-2 rounded-md border border-border bg-card px-5 text-sm font-medium transition-colors hover:border-muted-foreground/60">
                Create a class <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            </Reveal>
            <Reveal delay={120}>
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="overflow-hidden rounded-lg border border-border bg-background">
                  <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Class mastery map</p>
                    <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Example</span>
                  </div>
                  <div className="grid grid-cols-6 gap-1.5 p-4" aria-hidden="true">
                    {Array.from({ length: 30 }, (_, i) => {
                      const v = (i * 7 + (i % 4) * 3) % 10;
                      const tone = v > 6 ? "bg-emerald-500/35" : v > 3 ? "bg-amber-400/35" : "bg-rose-500/30";
                      return <span key={i} className={`aspect-[5/3] rounded-[3px] ${tone}`} />;
                    })}
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border px-4 py-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-emerald-500/35" /> Mastered</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-amber-400/35" /> Learning</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-rose-500/30" /> Needs work</span>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* LANGUAGES */}
        <section id="languages" className="scroll-mt-14 border-b border-border">
          <div className={`${rail} px-5 py-20 sm:px-8 lg:py-28`}>
            <Reveal className="max-w-3xl space-y-4">
              <p className={`${label} flex items-center gap-2`}><Languages className="h-3.5 w-3.5" aria-hidden="true" /> Languages</p>
              <h2 className="text-[clamp(2rem,4.6vw,3.5rem)] font-medium leading-[1.04] tracking-[-0.03em]">
                Learn in the language you <em className="font-serif font-normal italic text-brand-600 dark:text-brand-400">think</em> in
              </h2>
              <p className="max-w-xl text-[15px] leading-relaxed text-muted-foreground">Notes, lessons, quizzes and the tutor work in eight languages. Yorùbá voice is in beta.</p>
            </Reveal>
            <ul className="mt-12 flex flex-wrap gap-x-10 gap-y-3 border-t border-border pt-8">
              {LANGS.map((l, i) => (
                <Reveal as="li" key={l} delay={i * 50} className="text-2xl font-medium tracking-tight text-muted-foreground transition-colors hover:text-brand-600 dark:hover:text-brand-400 sm:text-3xl">
                  <span translate="no">{l}</span>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="relative overflow-hidden border-b border-border">
          <PixelField className="absolute inset-0 h-full w-full opacity-70" />
          <div className={`${rail} relative px-5 py-24 sm:px-8 lg:py-32`}>
            <Reveal className="max-w-3xl space-y-8">
              <h2 className="text-[clamp(2.25rem,5.6vw,4.75rem)] font-medium leading-[1.02] tracking-[-0.035em]">
                Bring the files you already have. <em className="font-serif font-normal italic text-brand-600 dark:text-brand-400">Start learning</em> in minutes.
              </h2>
              <div className="flex flex-wrap items-center gap-4">
                <Link href="/signup" className="group inline-flex h-12 items-center gap-2 rounded-md bg-brand-500 px-6 text-sm font-semibold text-slate-950 transition-colors hover:bg-brand-400">
                  Start free <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <a href="/sunroot-2.5.apk" download className="inline-flex h-12 items-center gap-2 rounded-md border border-border bg-card/80 px-6 text-sm font-medium transition-colors hover:border-muted-foreground/60">
                  <Download className="h-4 w-4" /> Download for Android
                </a>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="bg-background">
        <div className="mx-auto flex max-w-[1280px] flex-col justify-between gap-4 px-5 py-8 sm:flex-row sm:items-center sm:px-8">
          <div className="flex items-center gap-2.5">
            <Image src="/logo-mark.svg" alt="" width={24} height={24} className="h-6 w-6" />
            <span translate="no" className="text-sm font-semibold">Sunroot</span>
            <span className={label}>&copy; 2026</span>
          </div>
          <nav className="flex flex-wrap gap-6" aria-label="Account">
            <Link href="/about" className={`${label} hover:text-foreground`}>About & Leadership</Link>
            <Link href="/login" className={`${label} hover:text-foreground`}>Log in</Link>
            <Link href="/signup" className={`${label} hover:text-foreground`}>Create account</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
