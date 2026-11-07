import { LandingButtons } from "@/components/auth/landing-buttons";
import { MobileLandingRedirect } from "@/components/auth/mobile-landing-redirect";
import React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Check,
  Headphones,
  SlidersHorizontal,
  ListChecks,
  Cpu,
  Languages,
  ShieldCheck,
  Radar,
  Smartphone,
  Download,
  Sparkles,
  Bot,
  Zap,
  Box,
} from "lucide-react";
import { SITE_ALT_NAME, SITE_DESCRIPTION, SITE_NAME, getSiteUrl } from "@/lib/site";

const LANGS = ["English", "Naijá", "Yorùbá", "Igbo", "Hausa", "Français", "العربية", "Kiswahili"];

const DIMENSIONS = [
  {
    n: "01",
    title: "Listen & Read",
    tag: "Bilingual Audio",
    body: "Two-voice conversational podcast and structured notes generated from your class materials in your own language.",
    img: "/landing/learn.jpg",
    alt: "Lesson with a podcast player",
    icon: Headphones,
    accent: "from-amber-500/20 to-teal-500/10",
  },
  {
    n: "02",
    title: "Simulate Live",
    tag: "Physics & Circuits",
    body: "Drag voltage, current, and resistance sliders and watch the real physical digital twin respond instantaneously.",
    img: "/landing/sim.jpg",
    alt: "Ohm's law circuit simulation with live sliders",
    icon: SlidersHorizontal,
    accent: "from-teal-500/20 to-blue-500/10",
  },
  {
    n: "03",
    title: "Build in 3D",
    tag: "Tinkercad-Style Studio",
    body: "Wire circuits, place breadboards and sensors, write code, and run robotic digital twins on the track.",
    img: "/landing/circuit.jpg",
    alt: "3D circuit workspace with motors and microcontrollers",
    icon: Box,
    accent: "from-amber-500/20 to-rose-500/10",
  },
  {
    n: "04",
    title: "Adaptive Practice",
    tag: "Skill Radar",
    body: "Targeted flashcards and smart diagnostic questions that hone in on the exact concepts you keep missing.",
    img: "/landing/quiz.jpg",
    alt: "Adaptive quiz question with instant feedback",
    icon: ListChecks,
    accent: "from-teal-500/20 to-amber-500/10",
  },
];

const STEPS = [
  { n: "1", title: "Drop the Syllabus", desc: "Lecturer or student drops course outline, lecture notes, or textbook PDFs." },
  { n: "2", title: "AI Synthesizes Class", desc: "Notes, 2-voice audio podcast, interactive lesson, practice set, and 3D simulation." },
  { n: "3", title: "Lecturer Approves", desc: "Teachers curate, edit, and push verified content directly to enrolled students." },
  { n: "4", title: "Students Build & Learn", desc: "Listen on commute, wire virtual circuits, run code, and test mastery." },
  { n: "5", title: "Live Skill Map Updates", desc: "Every answer and simulation run updates the mastery radar in real-time." },
];

function PhoneFrame({
  src,
  alt,
  className = "",
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div
      className={`rounded-[2.8rem] border-4 border-slate-800/80 dark:border-slate-700/80 bg-slate-950 p-2.5 shadow-2xl transition-all duration-500 hover:scale-[1.02] ${className}`}
    >
      <div className="relative overflow-hidden rounded-[2.2rem]">
        <Image
          src={src}
          alt={alt}
          width={780}
          height={1688}
          priority={priority}
          sizes="(max-width: 768px) 70vw, 360px"
          className="block h-auto w-full object-cover"
        />
      </div>
    </div>
  );
}

function LaptopFrame({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  return (
    <div className="flex flex-col items-center group transition-all duration-500 hover:scale-[1.01]">
      <div className="w-full rounded-t-2xl rounded-b-md border-2 border-border bg-slate-950 p-2.5 pb-4 shadow-2xl transition-shadow group-hover:shadow-teal-500/10">
        <div className="overflow-hidden rounded-md border border-slate-800">
          <Image
            src={src}
            alt={alt}
            width={1800}
            height={1125}
            sizes="(max-width: 768px) 92vw, 680px"
            className="block h-auto w-full object-cover"
          />
        </div>
      </div>
      <div className="h-3 w-[106%] rounded-b-xl bg-gradient-to-r from-slate-300 via-slate-200 to-slate-300 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 shadow-md" />
    </div>
  );
}

export default function LandingPage() {
  const siteUrl = getSiteUrl();
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      alternateName: [SITE_ALT_NAME, "Sunroot"],
      url: `${siteUrl}/`,
      description: SITE_DESCRIPTION,
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE_NAME,
      url: `${siteUrl}/`,
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground transition-colors duration-300 selection:bg-teal-500 selection:text-white">
      <MobileLandingRedirect />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />

      {/* FLOATING FROSTED HEADER */}
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-xl transition-colors">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 shadow-md transition-transform group-hover:scale-105">
              <Image src="/logo-mark.svg" alt="" width={24} height={24} className="h-6 w-6" priority />
            </div>
            <div className="flex flex-col">
              <span translate="no" className="font-display text-xl font-black tracking-tight leading-none text-foreground">
                Sunroot<span className="text-amber-500">.</span>
              </span>
              <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase leading-none mt-0.5">
                Learn &amp; Build
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden items-center gap-8 text-sm font-semibold text-muted-foreground md:flex">
            <a href="#dimensions" className="transition-colors hover:text-foreground">
              How Students Learn
            </a>
            <a href="#studio" className="flex items-center gap-1.5 transition-colors hover:text-foreground">
              <Box className="h-4 w-4 text-amber-500" /> 3D Studio &amp; Circuits
            </a>
            <a href="#prove" className="transition-colors hover:text-foreground">
              Digital Twin
            </a>
            <a href="#teachers" className="transition-colors hover:text-foreground">
              For Lecturers
            </a>
          </nav>

          {/* Right Action Buttons */}
          <LandingButtons />
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative overflow-hidden bg-radial-hero pt-12 pb-20 md:pt-20 md:pb-28">
        {/* Ambient atmospheric backlight blobs */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-gradient-to-br from-teal-500/15 via-amber-500/10 to-transparent blur-3xl"
        />

        <div className="relative mx-auto grid max-w-[1240px] items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Hero Copy */}
          <div className="space-y-6 text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300 backdrop-blur-sm">
              <span className="h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
              The Interactive STEM Classroom &amp; 3D Studio
            </div>

            <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl font-black leading-[1.02] tracking-tight">
              Stop cramming.
              <br />
              <span className="text-gradient-amber">Start building.</span>
              <br />
              <span className="text-gradient-brand">Prove you know it.</span>
            </h1>

            <p className="max-w-xl text-base sm:text-lg leading-relaxed text-muted-foreground">
              Upload lecture notes, PDFs or handwritten photos. Sunroot generates interactive lessons, a two-voice bilingual podcast, smart practice, and for science &amp; engineering: a live 3D circuit bench and physical simulation studio.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 pt-2">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-500 via-amber-500 to-amber-600 px-7 py-4 text-base font-bold text-slate-950 shadow-md transition-all hover:scale-[1.02] hover:shadow-[0_12px_28px_-8px_rgba(245,158,11,0.5)] active:scale-95"
              >
                Start learning free <ArrowRight className="h-5 w-5" />
              </Link>
              <a
                href="#studio"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card/60 px-6 py-4 text-base font-bold text-foreground backdrop-blur-sm transition-all hover:bg-muted hover:border-teal-500/40 active:scale-95"
              >
                <Sparkles className="h-5 w-5 text-amber-500" /> Explore 3D Studio
              </a>
              <a
                href="/sunroot-2.5.apk"
                download
                className="inline-flex items-center justify-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-5 py-4 text-sm font-bold text-teal-800 dark:text-teal-300 transition-all hover:bg-teal-500/20 active:scale-95"
              >
                <Smartphone className="h-4 w-4 text-teal-600 dark:text-teal-400" /> Android App v2.5
              </a>
            </div>

            {/* Metric pill tags */}
            <div className="flex flex-wrap items-center gap-4 pt-4 text-xs font-semibold text-muted-foreground border-t border-border/60">
              <span className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-teal-600 dark:text-teal-400" /> 8 African &amp; Global Languages
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-teal-600 dark:text-teal-400" /> Real-time 3D Digital Twin Bench
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-teal-600 dark:text-teal-400" /> Zero-Hallucination Verified
              </span>
            </div>
          </div>

          {/* Hero Visual Mockup Stage */}
          <div className="relative mx-auto h-[480px] w-full max-w-[460px] sm:h-[580px]">
            {/* Phone 1: Simulation */}
            <div className="absolute left-0 top-12 w-[56%] -rotate-6 transition-transform duration-500 hover:rotate-0 hover:z-20">
              <PhoneFrame src="/landing/sim.jpg" alt="Live circuit simulation" />
            </div>

            {/* Phone 2: Audio & Notes */}
            <div className="absolute right-0 top-0 w-[60%] rotate-[4deg] transition-transform duration-500 hover:rotate-0 hover:z-20">
              <PhoneFrame src="/landing/learn.jpg" alt="Interactive lesson and audio podcast" priority />
            </div>

            {/* Floating Glass Badges */}
            <div className="animate-float absolute -left-4 bottom-24 flex items-center gap-2.5 rounded-2xl glass-surface px-4 py-3 shadow-xl">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-500/15 text-teal-600 dark:text-teal-400">
                <Headphones className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">Podcast in 8 Languages</p>
                <p className="text-[10px] text-muted-foreground">English, Naijá, Yorùbá, Hausa…</p>
              </div>
            </div>

            <div className="animate-float-delayed absolute bottom-6 right-2 flex items-center gap-2.5 rounded-2xl glass-surface px-4 py-3 shadow-xl">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
                <Cpu className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">Live Physics Answer</p>
                <p className="text-[10px] text-muted-foreground">Target hit: 120 mA &middot; 5V loop</p>
              </div>
            </div>
          </div>
        </div>

        {/* LANGUAGES RIBBON */}
        <div className="mt-16 border-y border-border/60 bg-muted/30 backdrop-blur-md">
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              <Languages className="h-4 w-4" /> Learn in your native voice:
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-sm font-medium text-foreground">
              {LANGS.map((lang) => (
                <span
                  key={lang}
                  translate="no"
                  className="rounded-full bg-card px-3 py-1 text-xs font-semibold border border-border shadow-2xs transition-colors hover:border-teal-500/50"
                >
                  {lang}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* THE 4 DIMENSIONS OF LEARNING (Tinkercad / Autodesk Inspired) */}
      <section id="dimensions" className="px-4 py-20 sm:px-6 md:py-28">
        <div className="mx-auto max-w-[1240px] space-y-16">
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
              <Sparkles className="h-4 w-4" /> The 4 Dimensions of Learning
            </div>
            <h2 className="font-display text-3xl sm:text-5xl font-black tracking-tight leading-tight">
              One topic, four ways in.
              <br />
              <span className="text-gradient-brand">Until everything clicks.</span>
            </h2>
            <p className="text-base text-muted-foreground">
              Everyone learns differently. Sunroot builds four parallel pathways for every topic in your syllabus so you can listen, manipulate, build, and master it.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {DIMENSIONS.map((dim) => {
              const Icon = dim.icon;
              return (
                <div
                  key={dim.n}
                  className="group relative flex flex-col justify-between rounded-3xl border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:border-teal-500/40"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold tracking-widest text-amber-500">{dim.n}</span>
                      <span className="rounded-full bg-teal-500/10 px-2.5 py-0.5 text-[11px] font-bold text-teal-700 dark:text-teal-300 border border-teal-500/20">
                        {dim.tag}
                      </span>
                    </div>

                    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-muted/50 p-2 border border-border/80">
                      <Image
                        src={dim.img}
                        alt={dim.alt}
                        fill
                        className="object-cover rounded-xl transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>

                    <div className="space-y-1.5 pt-2">
                      <h3 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
                        <Icon className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                        {dim.title}
                      </h3>
                      <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground">{dim.body}</p>
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-border/60 flex items-center justify-between text-xs font-bold text-teal-600 dark:text-teal-400 group-hover:translate-x-1 transition-transform">
                    <span>Explore module</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3D STUDIO & TINKERCAD SHOWCASE */}
      <section id="studio" className="relative border-y border-border bg-muted/20 px-4 py-20 sm:px-6 md:py-28">
        <div className="mx-auto max-w-[1240px] space-y-14">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                <Box className="h-4 w-4" /> 3D Studio &amp; Circuit Digital Twin
              </div>
              <h2 className="font-display text-3xl sm:text-5xl font-black tracking-tight leading-tight">
                Don’t just read about circuits.
                <br />
                <span className="text-gradient-amber">Wire, code &amp; simulate them.</span>
              </h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                Like Tinkercad built directly into your classroom: pick authentic components from the parts catalog, wire closed circuits, write real Arduino C++ or block logic, and test them with real-time physics simulation.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-2xl border border-border bg-card">
                  <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-3">
                    <Zap className="h-5 w-5" />
                  </div>
                  <h4 className="font-bold text-sm text-foreground">Interactive Circuit Bench</h4>
                  <p className="text-xs text-muted-foreground mt-1">Place breadboards, resistors, ICs, sensors and motors with live current tracing.</p>
                </div>

                <div className="p-4 rounded-2xl border border-border bg-card">
                  <div className="h-9 w-9 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center mb-3">
                    <Bot className="h-5 w-5" />
                  </div>
                  <h4 className="font-bold text-sm text-foreground">Line Follower Digital Twin</h4>
                  <p className="text-xs text-muted-foreground mt-1">Upload student C++ code and watch the 3D twin navigate curves, obstacles, and race tracks.</p>
                </div>
              </div>

              <div className="pt-2">
                <Link
                  href="/studio"
                  className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-6 py-3.5 text-sm font-bold shadow-md transition-all hover:opacity-90 active:scale-95"
                >
                  Open 3D Studio Now <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* Laptop Mockup: Circuit Bench */}
            <div className="relative">
              <LaptopFrame src="/landing/circuit.jpg" alt="Sunroot 3D circuit simulation bench" />
            </div>
          </div>
        </div>
      </section>

      {/* PROVE IT */}
      <section id="prove" className="px-4 py-20 sm:px-6 md:py-28">
        <div className="mx-auto grid max-w-[1240px] items-center gap-14 lg:grid-cols-2">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
              <ShieldCheck className="h-4 w-4" /> Proof of Mastery
            </div>
            <h2 className="font-display text-3xl sm:text-5xl font-black tracking-tight leading-tight">
              If you can wire it, code it and run it,
              <br />
              <span className="text-gradient-teal">you truly understand it.</span>
            </h2>
            <p className="text-base text-muted-foreground leading-relaxed">
              Exams test memorization. Sunroot tests true understanding. Every circuit you build and code you deploy moves your verified mastery score.
            </p>

            <ul className="space-y-3.5 text-sm sm:text-base text-foreground font-medium">
              {[
                "Pick real parts from the catalog and place them on the breadboard",
                "Wire a closed loop and observe voltage drops and current live",
                "Program logic with visual blocks or real Arduino C++",
                "Run the digital twin: wrong logic immediately manifests on the physical track",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-500/15 text-teal-600 dark:text-teal-400">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative">
            <LaptopFrame src="/landing/prove.jpg" alt="A line-following robot digital twin running code" />
          </div>
        </div>
      </section>

      {/* FOR LECTURERS & UNIVERSITIES */}
      <section id="teachers" className="border-t border-border bg-muted/20 px-4 py-20 sm:px-6 md:py-28">
        <div className="mx-auto grid max-w-[1240px] items-center gap-14 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="order-2 lg:order-1">
            <LaptopFrame src="/landing/mastery.jpg" alt="Class mastery heatmap per topic" />
          </div>

          <div className="order-1 space-y-6 lg:order-2">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              <Radar className="h-4 w-4" /> For Lecturers &amp; Educators
            </div>
            <h2 className="font-display text-3xl sm:text-5xl font-black tracking-tight leading-tight">
              See who’s stuck, on what,
              <br />
              <span className="text-gradient-amber">weeks before the exam.</span>
            </h2>

            <div className="space-y-4 pt-2">
              {[
                {
                  icon: Radar,
                  title: "A Live Mastery Radar",
                  body: "Every quiz answer, flashcard flip, and 3D build updates each student’s score per concept in real time.",
                },
                {
                  icon: ShieldCheck,
                  title: "You Stay 100% in Charge",
                  body: "AI drafts the syllabus, podcast, lab, and question bank. Students only see what you review and publish.",
                },
                {
                  icon: Languages,
                  title: "One Class, Many Languages",
                  body: "Students can read and listen in Naijá, Yorùbá, Hausa, French or English. You teach once in yours.",
                },
              ].map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex gap-4 p-4 rounded-2xl border border-border bg-card">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-display text-base font-bold text-foreground">{title}</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 leading-relaxed">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS ROADMAP */}
      <section className="border-t border-border px-4 py-20 sm:px-6 md:py-28">
        <div className="mx-auto max-w-[1240px] space-y-14">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">The Workflow</p>
            <h2 className="font-display text-3xl sm:text-5xl font-black tracking-tight">
              From course syllabus to a full interactive classroom in 5 steps.
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((step) => (
              <div
                key={step.n}
                className="flex flex-col justify-between rounded-3xl border border-border bg-card p-6 shadow-2xs transition-all hover:border-teal-500/40 hover:-translate-y-1"
              >
                <div>
                  <span className="font-display text-4xl font-black text-amber-500 block mb-3">{step.n}</span>
                  <h3 className="font-display text-base font-bold text-foreground leading-snug mb-2">{step.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ANDROID DOWNLOAD CARD */}
      <section className="px-4 pb-20 sm:px-6">
        <div className="mx-auto flex max-w-[1240px] flex-col items-center justify-between gap-8 rounded-3xl border-2 border-teal-500/20 bg-gradient-to-br from-card via-card to-teal-500/5 p-8 sm:p-12 md:flex-row shadow-xl">
          <div className="flex items-center gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-lg">
              <Smartphone className="h-8 w-8" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">Mobile Edition</p>
              <h3 className="font-display text-2xl font-bold sm:text-3xl text-foreground">Take Sunroot with you anywhere</h3>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-md mt-1">
                Study offline summaries, listen to audio lessons, and get push study reminders on Android.
              </p>
            </div>
          </div>
          <a
            href="/sunroot-2.5.apk"
            download
            className="inline-flex shrink-0 items-center gap-2.5 rounded-full bg-teal-600 px-7 py-4 text-base font-bold text-white shadow-md transition-all hover:bg-teal-500 hover:scale-105 active:scale-95"
          >
            <Download className="h-5 w-5 stroke-[2.5]" /> Download Android APK (v2.5)
          </a>
        </div>
      </section>

      {/* FINAL CALL TO ACTION */}
      <section className="bg-gradient-to-br from-amber-500 via-amber-500 to-amber-600 px-4 py-16 sm:px-6 text-slate-950">
        <div className="mx-auto flex max-w-[1240px] flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div>
            <h2 className="font-display text-3xl sm:text-5xl font-black leading-tight">
              Understand it.
              <br />
              Build it. Prove it.
            </h2>
            <p className="text-sm sm:text-base font-medium opacity-90 mt-2 max-w-lg">
              Join thousands of students and lecturers transforming technical education.
            </p>
          </div>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-8 py-4 text-base font-bold text-white shadow-xl transition-all hover:scale-105 hover:bg-slate-900 active:scale-95"
          >
            Try Sunroot free <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border bg-card px-4 py-12 sm:px-6">
        <div className="mx-auto flex max-w-[1240px] flex-col justify-between gap-6 sm:flex-row sm:items-center text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <Image src="/logo-mark.svg" alt="" width={24} height={24} className="h-6 w-6" />
            <span translate="no" className="font-display font-bold text-foreground">Sunroot</span>
            <span className="text-xs">&copy; 2026 Sunroot Technologies.</span>
          </div>
          <nav className="flex flex-wrap gap-6 text-xs sm:text-sm font-semibold">
            <Link href="/login" className="hover:text-foreground">Log in</Link>
            <Link href="/signup" className="hover:text-foreground">Create account</Link>
            <Link href="/dashboard" className="hover:text-foreground">Student Hub</Link>
            <Link href="/studio" className="hover:text-foreground">3D Studio</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
