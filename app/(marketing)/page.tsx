import { LandingButtons } from "@/components/auth/landing-buttons";
import { MobileLandingRedirect } from "@/components/auth/mobile-landing-redirect";
import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BookOpenText, Download, FileUp, GraduationCap, Languages, Layers, ListChecks, MessagesSquare, Presentation, Route, Wrench } from "lucide-react";
import { SITE_ALT_NAME, SITE_DESCRIPTION, SITE_NAME, getSiteUrl } from "@/lib/site";

const LANGS = ["English", "Naijá", "Yorùbá", "Igbo", "Hausa", "Français", "العربية", "Kiswahili"];
const FILES = ["PDF", "Scans & photos", "Handwriting", "Word", "Slides"];

const STEPS = [
  { n: "01", title: "Upload what you have", body: "A typed PDF, a scan of handwritten notes, a photo of the board, a Word file or slides. Sunroot reads all of them." },
  { n: "02", title: "Sunroot decides what it needs", body: "A maths topic gets worked steps and practice. An electronics topic gets a simulator and a build. Nothing you don't need." },
  { n: "03", title: "Learn it, then prove it", body: "Short lessons, flashcards and quizzes, a tutor you can ask, and a plan built from the questions you got wrong." },
];

const FEATURES = [
  { icon: BookOpenText, title: "Study notes", body: "Clean, structured notes from any file, with page references you can refine or download." },
  { icon: Presentation, title: "Teach me", body: "Step-by-step animated lessons you can pause, replay and interact with, in the voice and speed you choose." },
  { icon: ListChecks, title: "Flashcards and quizzes", body: "Made from your own notes in one tap, with spaced repetition so you remember them." },
  { icon: MessagesSquare, title: "AI tutor", body: "Ask in text or by voice. The tutor answers in your language and points back to your material." },
  { icon: Wrench, title: "Maker Studio", body: "Wire circuits, write code and run them in a simulator, then build the same thing in 3D." },
  { icon: Route, title: "How am I doing?", body: "Finds what you are stuck on from your wrong answers and gives you a short plan to fix it." },
];

/** A browser-style frame around a real screenshot of the app. */
function Window({ src, alt, w, h, label, priority = false }: { src: string; alt: string; w: number; h: number; label: string; priority?: boolean }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-1.5 border-b border-border bg-muted px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-600" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-600" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-600" />
        <figcaption className="ml-3 truncate font-mono text-[11px] text-muted-foreground">{label}</figcaption>
      </div>
      <Image src={src} alt={alt} width={w} height={h} priority={priority} sizes="(min-width: 1024px) 560px, 100vw" className="block h-auto w-full" />
    </figure>
  );
}

function Phone({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="space-y-3">
      <div className="mx-auto w-full max-w-[240px] overflow-hidden rounded-[22px] border border-border bg-card p-1.5">
        <Image src={src} alt={alt} width={780} height={1688} sizes="240px" className="block h-auto w-full rounded-[16px]" />
      </div>
      <figcaption className="text-center text-sm text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}

export default function LandingPage() {
  const siteUrl = getSiteUrl();
  const structuredData = [
    { "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, alternateName: [SITE_ALT_NAME, "Sunroot"], url: `${siteUrl}/`, description: SITE_DESCRIPTION },
    { "@context": "https://schema.org", "@type": "Organization", name: SITE_NAME, url: `${siteUrl}/` },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-teal-600 selection:text-white">
      <MobileLandingRedirect />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />

      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-teal-600">
              <Image src="/logo-mark.svg" alt="" width={20} height={20} className="h-5 w-5" priority />
            </span>
            <span translate="no" className="text-lg font-semibold tracking-tight">
              Sunroot
            </span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex" aria-label="Page sections">
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#features" className="hover:text-foreground">What you get</a>
            <a href="#teachers" className="hover:text-foreground">For teachers</a>
            <a href="#languages" className="hover:text-foreground">Languages</a>
          </nav>
          <LandingButtons />
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="border-b border-border">
          <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:py-24">
            <div className="space-y-6">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">Study platform for any subject</p>
              <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
                Upload anything.
                <br />
                Learn it your way.
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Sunroot reads your notes, scans and slides, then builds exactly what that topic needs: clear notes, animated lessons, practice and a tutor, in your own language.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/signup" className="inline-flex h-11 items-center gap-2 rounded-lg bg-teal-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600">
                  Start free <ArrowRight className="h-4 w-4" />
                </Link>
                <a href="#how" className="inline-flex h-11 items-center rounded-lg border border-slate-300 px-5 text-sm font-medium transition-colors hover:bg-muted dark:border-slate-700">
                  See how it works
                </a>
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-2 pt-2 text-sm text-muted-foreground" aria-label="Files Sunroot can read">
                <li className="font-medium text-foreground">Reads:</li>
                {FILES.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
            <Window src="/landing/mastery.jpg" alt="The Sunroot mastery map showing which topics a student has mastered" w={1800} h={1125} label="Your progress, topic by topic" priority />
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how" className="scroll-mt-14 border-b border-border">
          <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:py-20">
            <div className="max-w-2xl space-y-3">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">How it works</p>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">From a pile of files to something you can learn from</h2>
            </div>
            <ol className="mt-10 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.n} className="space-y-3 bg-background p-6 sm:p-8">
                  <span className="font-mono text-sm text-amber-600 dark:text-amber-400">{s.n}</span>
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="scroll-mt-14 border-b border-border bg-muted/40">
          <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:py-20">
            <div className="max-w-2xl space-y-3">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">What you get</p>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Everything for one topic, in one place</h2>
            </div>
            <dl className="mt-10 grid gap-x-10 gap-y-0 border-t border-border sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="flex gap-4 border-b border-border py-6">
                  <f.icon className="mt-0.5 h-5 w-5 shrink-0 text-teal-700 dark:text-teal-300" aria-hidden="true" />
                  <div className="space-y-1.5">
                    <dt className="font-semibold">{f.title}</dt>
                    <dd className="text-sm leading-relaxed text-muted-foreground">{f.body}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ON YOUR PHONE */}
        <section className="border-b border-border">
          <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:py-20">
            <div className="max-w-2xl space-y-3">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">On your phone</p>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Listen, practise and build wherever you are</h2>
            </div>
            <div className="mt-10 grid gap-10 sm:grid-cols-3">
              <Phone src="/landing/learn.jpg" alt="A lesson with an audio player" caption="Listen to the lesson" />
              <Phone src="/landing/quiz.jpg" alt="A quiz question with instant feedback" caption="Practise with feedback" />
              <Phone src="/landing/sim.jpg" alt="A circuit simulation with live sliders" caption="Test ideas in a simulator" />
            </div>
          </div>
        </section>

        {/* TEACHERS */}
        <section id="teachers" className="scroll-mt-14 border-b border-border bg-muted/40">
          <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-20">
            <Window src="/landing/prove.jpg" alt="A student rebuilding a circuit to prove they understand it" w={1800} h={1125} label="Prove it: rebuild it to show you understand" />
            <div className="space-y-6">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">For teachers and lecturers</p>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Publish a class from your syllabus file</h2>
              <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                <li className="flex gap-3"><FileUp className="mt-1 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-300" aria-hidden="true" /> Upload your syllabus or lecture notes as a PDF, scan, Word file or slides. Sunroot maps it into topics.</li>
                <li className="flex gap-3"><Layers className="mt-1 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-300" aria-hidden="true" /> Review and edit the lessons, practice questions and flashcards before students see them.</li>
                <li className="flex gap-3"><GraduationCap className="mt-1 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-300" aria-hidden="true" /> See which topics each student has mastered and where the class is stuck.</li>
              </ul>
              <Link href="/signup" className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 px-5 text-sm font-medium transition-colors hover:bg-background dark:border-slate-700">
                Create a class <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* LANGUAGES */}
        <section id="languages" className="scroll-mt-14 border-b border-border">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between lg:py-20">
            <div className="max-w-xl space-y-3">
              <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                <Languages className="h-4 w-4" aria-hidden="true" /> Languages
              </p>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Learn in the language you think in</h2>
              <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">Notes, lessons, quizzes and the tutor work in eight languages. Yorùbá voice is in beta.</p>
            </div>
            <ul className="flex max-w-md flex-wrap gap-2">
              {LANGS.map((l) => (
                <li key={l} translate="no" className="rounded-md border border-border px-3 py-1.5 text-sm">
                  {l}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ANDROID */}
        <section className="border-b border-border">
          <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-5 px-4 py-10 sm:px-6 md:flex-row md:items-center">
            <div>
              <h2 className="text-lg font-semibold">Sunroot for Android</h2>
              <p className="text-sm text-muted-foreground">Study offline, listen to lessons and get study reminders.</p>
            </div>
            <a href="/sunroot-2.5.apk" download className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 px-5 text-sm font-medium transition-colors hover:bg-muted dark:border-slate-700">
              <Download className="h-4 w-4" /> Download for Android
            </a>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="bg-slate-900 text-slate-50">
          <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-8 px-4 py-16 sm:px-6 md:flex-row md:items-center">
            <h2 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Bring the files you already have. Start learning in minutes.</h2>
            <Link href="/signup" className="inline-flex h-12 items-center gap-2 rounded-lg bg-amber-500 px-6 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400">
              Start free <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-border bg-background px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-[1200px] flex-col justify-between gap-4 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <Image src="/logo-mark.svg" alt="" width={20} height={20} className="h-5 w-5" />
            <span translate="no" className="font-semibold text-foreground">Sunroot</span>
            <span>&copy; 2026</span>
          </div>
          <nav className="flex flex-wrap gap-6" aria-label="Account">
            <Link href="/login" className="hover:text-foreground">Log in</Link>
            <Link href="/signup" className="hover:text-foreground">Create account</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
