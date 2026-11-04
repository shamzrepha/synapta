import { LandingButtons } from "@/components/auth/landing-buttons";
import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check, Headphones, SlidersHorizontal, ListChecks, Cpu, Languages, ShieldCheck, Radar, Smartphone, Download } from "lucide-react";
import { SITE_ALT_NAME, SITE_DESCRIPTION, SITE_NAME, getSiteUrl } from "@/lib/site";

/*
 * Landing page. One deliberate look in both themes: deep forest for the stage, warm cream for the reading
 * sections, sun orange for the single thing to press. Real app screens in device frames carry the story.
 */

const LANGS = ["English", "Naijá", "Yorùbá", "Igbo", "Hausa", "Français", "العربية", "Kiswahili"];

const WAYS = [
  { n: 1, title: "Listen & read", body: "A two-voice podcast and clear notes, in your own language.", img: "/landing/learn.jpg", alt: "Ohm's law lesson with a podcast player", icon: Headphones },
  { n: 2, title: "Simulate it", body: "Move the sliders and watch the physics answer back.", img: "/landing/sim.jpg", alt: "Ohm's law circuit simulation with voltage and resistance sliders", icon: SlidersHorizontal },
  { n: 3, title: "Practise smart", body: "Questions that go after the parts you keep missing.", img: "/landing/quiz.jpg", alt: "A quiz question answered correctly with its explanation", icon: ListChecks },
];

const STEPS = [
  ["Drop the syllabus", "The lecturer adds the course outline."],
  ["AI builds each topic", "Whatever the subject needs: notes, a two-voice podcast, an interactive lesson, practice, and for science a simulation or lab."],
  ["Lecturer approves", "Nothing reaches students until the teacher pushes it."],
  ["Students learn their way", "Listen, play with it, practise, and where it fits, build it."],
  ["Mastery updates live", "Every answer and every build moves the skill map."],
];

function Phone({ src, alt, className = "", priority = false }: { src: string; alt: string; className?: string; priority?: boolean }) {
  return (
    <div className={`rounded-[2.6rem] border-2 border-[#2E4B3D] bg-[#07130E] p-2.5 shadow-[0_40px_90px_-20px_rgba(0,0,0,0.65)] ${className}`}>
      <Image src={src} alt={alt} width={780} height={1688} priority={priority} sizes="(max-width: 768px) 60vw, 320px" className="block h-auto w-full rounded-[2rem]" />
    </div>
  );
}

function Laptop({ src, alt, base = "bg-[#3E5A4C]" }: { src: string; alt: string; base?: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-full rounded-t-2xl rounded-b-md border-2 border-[#2E4B3D] bg-[#07130E] p-2.5 pb-3.5 shadow-[0_40px_90px_-24px_rgba(0,0,0,0.55)]">
        <Image src={src} alt={alt} width={1800} height={1125} sizes="(max-width: 768px) 92vw, 640px" className="block h-auto w-full rounded-md" />
      </div>
      <div className={`h-3.5 w-[108%] rounded-b-2xl ${base}`} />
    </div>
  );
}

export default function LandingPage() {
  const siteUrl = getSiteUrl();
  // Structured data so search engines know the site's name (WebSite) and who runs it (Organization)
  const structuredData = [
    { "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, alternateName: [SITE_ALT_NAME, "Sunroot"], url: `${siteUrl}/`, description: SITE_DESCRIPTION },
    { "@context": "https://schema.org", "@type": "Organization", name: SITE_NAME, url: `${siteUrl}/` },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#FBF6EC] text-[#12241C]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0E1F18]/90 text-[#FBF6EC] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo-mark.svg" alt="" width={36} height={36} className="h-9 w-9" priority />
            <span translate="no" className="font-display text-xl font-bold tracking-tight">Sunroot</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-[#D7E2D9] md:flex">
            <a href="#four-ways" className="hover:text-[#F28C28]">How students learn</a>
            <a href="#prove" className="hover:text-[#F28C28]">Prove it</a>
            <a href="#teachers" className="hover:text-[#F28C28]">For lecturers</a>
          </nav>
          <div className="flex items-center gap-2">
            <LandingButtons />
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-[#0E1F18] text-[#FBF6EC]">
        <div aria-hidden className="pointer-events-none absolute -right-40 top-20 h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle,rgba(242,140,40,0.28)_0%,rgba(16,185,129,0.10)_45%,transparent_70%)]" />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-12 px-4 pb-16 pt-14 md:grid-cols-[1.1fr_0.9fr] md:pb-24 md:pt-20">
          <div className="min-w-0 space-y-7">
            <p className="inline-flex rounded-full bg-[#F28C28] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-[#12241C]">AI tutor for any subject</p>
            <h1 className="font-display text-5xl font-bold leading-[0.98] tracking-tight sm:text-6xl lg:text-7xl">
              Stop cramming.
              <br />
              Start building.
              <br />
              <span className="text-[#F28C28]">Prove you know it.</span>
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-[#D7E2D9]">
              Upload your notes, even handwritten photos, and get clear notes, a two-voice podcast, an interactive lesson and practice that finds your weak spots. For science and engineering there is a live lab and a 3D studio too. On your phone, in your language.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#F28C28] px-7 py-3.5 text-base font-bold text-[#12241C] shadow-[0_16px_40px_-12px_rgba(242,140,40,0.6)] hover:bg-[#F59E45]">
                Start learning free <ArrowRight className="h-5 w-5" />
              </Link>
              <Link href="/signup" className="inline-flex items-center justify-center rounded-full border-2 border-[#FBF6EC]/30 px-7 py-3.5 text-base font-bold text-[#FBF6EC] hover:border-[#FBF6EC]/60">
                I teach a class
              </Link>
              <a href="/sunroot-2.1.apk" download className="group inline-flex items-center justify-center gap-2 rounded-full border-2 border-[#14b8a6] bg-[#14b8a6]/15 px-6 py-3.5 text-base font-bold text-[#FBF6EC] backdrop-blur-sm transition-all hover:bg-[#14b8a6] hover:text-[#0E1F18] shadow-[0_8px_20px_-6px_rgba(20,184,166,0.5)]">
                <Smartphone className="h-5 w-5 text-[#14b8a6] group-hover:text-[#0E1F18] transition-colors" /> Download Android App (v2.1)
              </a>
            </div>
          </div>
          <div className="relative mx-auto h-[520px] w-full max-w-[460px] sm:h-[600px]">
            <Phone src="/landing/sim.jpg" alt="Ohm's law simulation on a phone" className="absolute left-0 top-10 w-[55%] -rotate-6" />
            <Phone src="/landing/learn.jpg" alt="Ohm's law lesson and podcast player on a phone" className="absolute right-0 top-0 w-[60%] rotate-[4deg]" priority />
            <p className="absolute -left-2 bottom-24 flex items-center gap-2 rounded-2xl bg-[#FBF6EC] px-4 py-2.5 text-sm font-bold text-[#12241C] shadow-xl sm:-left-6">
              <Headphones className="h-4 w-4 text-[#18714E]" /> Podcast in 8 languages
            </p>
            <p className="absolute bottom-8 right-2 flex items-center gap-2 rounded-2xl bg-[#10B981] px-4 py-2.5 text-sm font-bold text-[#06261A] shadow-xl">
              <Cpu className="h-4 w-4" /> Target hit: 120 mA
            </p>
          </div>
        </div>
        {/* Languages strip */}
        <div className="border-t border-white/10 bg-[#0A1812]">
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 text-sm">
            <span className="flex items-center gap-2 font-bold uppercase tracking-[0.14em] text-[#F28C28]"><Languages className="h-4 w-4" /> Learn in</span>
            {LANGS.map((l) => (
              <span key={l} translate="no" className="font-display text-base font-medium text-[#D7E2D9]">{l}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Four ways */}
      <section id="four-ways" className="px-4 py-20 md:py-28">
        <div className="mx-auto max-w-[1200px] space-y-14">
          <div className="max-w-2xl space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#18714E]">One topic, four ways in</p>
            <h2 className="font-display text-4xl font-bold leading-[1.05] md:text-5xl">Hear it. Test it. Practise it. Then build it until it clicks.</h2>
          </div>
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {WAYS.map((w) => (
              <div key={w.n} className="flex min-w-0 flex-col gap-5">
                <Phone src={w.img} alt={w.alt} className="mx-auto w-[78%] max-w-[260px]" />
                <div className="space-y-1.5">
                  <h3 className="font-display text-xl font-bold"><span className="text-[#D7721A]">{w.n} ·</span> {w.title}</h3>
                  <p className="text-[15px] leading-relaxed text-[#4C5A51]">{w.body}</p>
                </div>
              </div>
            ))}
            <div className="flex min-w-0 flex-col gap-5">
              <div className="flex flex-1 items-center">
                <Laptop src="/landing/circuit.jpg" alt="Circuit bench with a board, motor driver and two motors" base="bg-[#D7CFBF]" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display text-xl font-bold"><span className="text-[#D7721A]">4 ·</span> Build &amp; prove it</h3>
                <p className="text-[15px] leading-relaxed text-[#4C5A51]">Wire the circuit, write the code and run it in 3D.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Prove it */}
      <section id="prove" className="bg-[#0E1F18] px-4 py-20 text-[#FBF6EC] md:py-28">
        <div className="mx-auto grid max-w-[1200px] items-center gap-14 md:grid-cols-2">
          <div className="min-w-0 space-y-7">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#F28C28]">Prove it</p>
            <h2 className="font-display text-4xl font-bold leading-[1.05] md:text-5xl">If you can wire it, code it and run it, you understand it.</h2>
            <ul className="space-y-4 text-lg text-[#D7E2D9]">
              {["Pick real parts from the shop and place them on the bench", "Wire a closed loop and see the current live", "Program it with blocks or real C++", "Run the digital twin: wrong logic shows up on the track"].map((t) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F28C28] text-[#12241C]"><Check className="h-4 w-4" strokeWidth={3} /></span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <Laptop src="/landing/prove.jpg" alt="A line-following robot digital twin running a student's code" />
        </div>
      </section>

      {/* Teachers */}
      <section id="teachers" className="px-4 py-20 md:py-28">
        <div className="mx-auto grid max-w-[1200px] items-center gap-14 md:grid-cols-[1.15fr_0.85fr]">
          <div className="order-2 min-w-0 md:order-1">
            <Laptop src="/landing/mastery.jpg" alt="Class mastery heatmap showing each student's score per topic" base="bg-[#D7CFBF]" />
          </div>
          <div className="order-1 min-w-0 space-y-7 md:order-2">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#18714E]">For lecturers</p>
            <h2 className="font-display text-4xl font-bold leading-[1.05] md:text-5xl">See who’s stuck, on what, before the exam.</h2>
            <div className="space-y-5">
              {[
                [Radar, "A live mastery map", "Every quiz answer, flashcard and build updates each student’s score per topic."],
                [ShieldCheck, "You stay in charge", "The AI drafts the notes, podcast, lab and question bank. Students see only what you publish."],
                [Languages, "One class, many languages", "Each student reads and listens in their own language. You teach in yours."],
              ].map(([Icon, title, body]) => {
                const I = Icon as typeof Radar;
                return (
                  <div key={title as string} className="flex gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#12241C] text-[#F28C28]"><I className="h-5 w-5" /></span>
                    <div>
                      <h3 className="font-display text-lg font-bold">{title as string}</h3>
                      <p className="text-[15px] leading-relaxed text-[#4C5A51]">{body as string}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-[#E4DBC9] bg-[#F3ECDF] px-4 py-20 md:py-24">
        <div className="mx-auto max-w-[1200px] space-y-12">
          <h2 className="font-display max-w-3xl text-4xl font-bold leading-[1.05] md:text-5xl">From course syllabus to a full interactive class.</h2>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map(([t, d], i) => (
              <li key={t} className={`flex flex-col gap-3 rounded-3xl p-6 ${i === 2 ? "bg-[#12241C] text-[#FBF6EC]" : "bg-[#FFFDF8]"}`}>
                <span className="font-display text-4xl font-bold text-[#D7721A]">{i + 1}</span>
                <h3 className="font-display text-lg font-bold leading-snug">{t}</h3>
                <p className={`text-sm leading-relaxed ${i === 2 ? "text-[#D7E2D9]" : "text-[#4C5A51]"}`}>{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Mobile App Download Card */}
      <section className="border-t border-[#2E4B3D] bg-[#0A1812] px-4 py-16 text-[#FBF6EC]">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-8 rounded-3xl border border-[#2E4B3D] bg-[#0E1F18] p-8 md:flex-row md:p-12 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#14b8a6] to-[#0d9488] shadow-lg">
              <Smartphone className="h-8 w-8 text-white" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#14b8a6]">Mobile Edition</p>
              <h3 className="font-display text-2xl font-bold md:text-3xl">Take Sunroot with you anywhere</h3>
              <p className="text-sm text-[#D7E2D9] max-w-md mt-1">Study offline summaries, listen to audio lessons, and get instant push study notifications directly on Android.</p>
            </div>
          </div>
          <a
            href="/sunroot-2.1.apk"
            download
            className="inline-flex shrink-0 items-center gap-2.5 rounded-full bg-[#14b8a6] px-7 py-4 text-base font-bold text-[#0E1F18] shadow-[0_12px_30px_-8px_rgba(20,184,166,0.6)] transition-transform hover:scale-105 active:scale-95"
          >
            <Download className="h-5 w-5 stroke-[2.5]" /> Download Sunroot v2.1 (Android)
          </a>
        </div>
      </section>

      {/* Final call */}
      <section className="bg-[#F28C28] px-4 py-16 text-[#12241C]">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <h2 className="font-display text-4xl font-bold leading-[1.02] md:text-6xl">Understand it.<br />Build it. Prove it.</h2>
          <Link href="/signup" className="inline-flex items-center gap-2 rounded-full bg-[#12241C] px-8 py-4 text-lg font-bold text-[#FBF6EC] hover:bg-[#1C352A]">
            Try Sunroot free <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0E1F18] px-4 py-10 text-[#D7E2D9]">
        <div className="mx-auto flex max-w-[1200px] flex-col justify-between gap-6 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <Image src="/logo-mark.svg" alt="" width={28} height={28} className="h-7 w-7" />
            <span translate="no" className="font-display font-bold text-[#FBF6EC]">Sunroot</span>
            <span className="text-xs">© 2026</span>
          </div>
          <nav className="flex gap-6 text-sm">
            <Link href="/login" className="hover:text-[#F28C28]">Log in</Link>
            <Link href="/signup" className="hover:text-[#F28C28]">Create account</Link>
            <Link href="/dashboard" className="hover:text-[#F28C28]">Student app</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
