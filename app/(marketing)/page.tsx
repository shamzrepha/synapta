import React from "react";
import Link from "next/link";
import {
  BrainCircuit,
  Sparkles,
  Cpu,
  Layers,
  ArrowRight,
  CheckCircle2,
  Users,
  GraduationCap,
  ShieldCheck,
  Flame,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SITE_ALT_NAME, SITE_DESCRIPTION, SITE_NAME, getSiteUrl } from "@/lib/site";

export default function LandingPage() {
  const siteUrl = getSiteUrl();
  // Structured data so search engines know the site's name (WebSite) and who runs it (Organization)
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
    <div className="min-h-screen bg-[#F7F6F2] dark:bg-[#0B0F14] text-slate-900 dark:text-slate-100 flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/80 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-950/80">
        <div className="max-w-[1200px] mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950 font-bold shadow-sm">
              <BrainCircuit className="h-6 w-6" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg tracking-tight">Sunroot</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                Adaptive Learning
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a href="#features" className="hover:text-teal-600 dark:hover:text-teal-400 transition-colors">
              Features
            </a>
            <a href="#twin" className="hover:text-teal-600 dark:hover:text-teal-400 transition-colors">
              Skill Map
            </a>
            <a href="#roles" className="hover:text-teal-600 dark:hover:text-teal-400 transition-colors">
              Roles
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Log In
              </Button>
            </Link>
            <Link href="/signup">
              <Button size="sm">
                Get Started
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-20 pb-16 md:pt-28 md:pb-24 px-4 overflow-hidden border-b border-slate-200/60 dark:border-slate-800/60">
        <div className="max-w-[1200px] mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-700 dark:text-teal-300">
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI-Native Adaptive Education Architecture</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight max-w-4xl mx-auto leading-[1.15] text-slate-900 dark:text-white">
            1-on-1 Tutoring for Every Student. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-teal-400">
              A Cognitive X-Ray for Every Teacher.
            </span>
          </h1>

          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Sunroot builds a live <strong>Skill Map</strong> for every learner that tracks what you have mastered and adapts your lessons to you. It brings together interactive labs, AI study notes with sources, and study rooms with friends.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link href="/signup" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto text-base">
                Start Learning Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/dashboard" className="w-full sm:w-auto">
              <Button variant="outline" size="lg" className="w-full sm:w-auto text-base">
                Explore Demo Dashboard
              </Button>
            </Link>
          </div>

          {/* Skill Map preview card */}
          <div className="pt-8 max-w-4xl mx-auto">
            <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-6 shadow-xl backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/70 text-left">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold">
                    CT
                  </div>
                  <div>
                    <h2 className="font-semibold text-sm">My Skill Map — your mastery right now</h2>
                    <p className="text-xs text-slate-500">Your mastery score for each topic</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="amber" className="text-xs">
                    <Flame className="h-3 w-3 mr-1" /> 5-Day Streak
                  </Badge>
                  <Badge variant="default" className="text-xs">
                    <Zap className="h-3 w-3 mr-1" /> 450 XP
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold">Ohm&apos;s Law (V=IR)</span>
                    <span className="text-xs font-bold text-emerald-500">96.4%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full w-[96.4%]" />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-2 block">Status: Mastered (Unlocked Advanced Labs)</span>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold">RC Filter Cutoff</span>
                    <span className="text-xs font-bold text-amber-500">62.8%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full w-[62.8%]" />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-2 block">Status: In Progress (Socratic Hint Available)</span>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold">Logic Gates & Half Adder</span>
                    <span className="text-xs font-bold text-rose-500">34.1%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-rose-500 rounded-full w-[34.1%]" />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-2 block">Status: Struggling (Matched with Peer Lounge)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3 Core Pillars Section */}
      <section id="features" className="py-20 px-4 max-w-[1200px] mx-auto w-full">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
          <Badge variant="outline" className="text-xs">Architecture Pillars</Badge>
          <h2 className="text-3xl font-bold tracking-tight">The Three Foundations of Sunroot</h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            Moving beyond passive video consumption into dynamic mastery learning and rigorous classroom intelligence.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Pillar 1 */}
          <Card className="border-slate-200/80 dark:border-slate-800/80 hover:border-teal-500/40 transition-all">
            <CardHeader>
              <div className="h-12 w-12 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center mb-2">
                <BrainCircuit className="h-6 w-6" />
              </div>
              <CardTitle>Adaptive Tutoring</CardTitle>
              <CardDescription>
                A mastery score for every topic, so you always know what to study next.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
              <p>
                Every quiz answer, flashcard and lab you complete updates your mastery score, and your lessons adapt to it.
              </p>
              <ul className="space-y-2 pt-2 text-xs">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-teal-500 shrink-0" />
                  <span>Socratic method: hints before answers</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-teal-500 shrink-0" />
                  <span>Strict dependency prerequisite graph</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-teal-500 shrink-0" />
                  <span>Automatic peer lounge intervention when struggling</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Pillar 2 */}
          <Card className="border-slate-200/80 dark:border-slate-800/80 hover:border-teal-500/40 transition-all">
            <CardHeader>
              <div className="h-12 w-12 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-2">
                <Cpu className="h-6 w-6" />
              </div>
              <CardTitle>Interactive Labs</CardTitle>
              <CardDescription>
                Hands-on interactive virtual apparatus embedded directly in topics.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
              <p>
                No separate sandbox or disconnected assignments. Interactive simulation labs are rendered inline alongside lessons with real-time feedback.
              </p>
              <ul className="space-y-2 pt-2 text-xs">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-amber-500 shrink-0" />
                  <span>Ohm&apos;s Law interactive circuit & electron flow</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-amber-500 shrink-0" />
                  <span>RC Filter frequency response & cutoff tuner</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-amber-500 shrink-0" />
                  <span>Logic gate circuit builder (Half-Adder verification)</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Pillar 3 */}
          <Card className="border-slate-200/80 dark:border-slate-800/80 hover:border-teal-500/40 transition-all">
            <CardHeader>
              <div className="h-12 w-12 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center mb-2">
                <Layers className="h-6 w-6" />
              </div>
              <CardTitle>Source-Grounded AI</CardTitle>
              <CardDescription>
                Upload textbooks, lecture notes, or research papers with strict citations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
              <p>
                NotebookLM-style grounded reasoning. Gemini answers strictly using your uploaded materials with verifiable citations and zero hallucination.
              </p>
              <ul className="space-y-2 pt-2 text-xs">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-teal-500 shrink-0" />
                  <span>Inline source attribution [S1], [S2]</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-teal-500 shrink-0" />
                  <span>Instant flashcards, summaries, and quizzes</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-teal-500 shrink-0" />
                  <span>Two-host &ldquo;Deep Dive&rdquo; dialogue with browser TTS</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Role Breakdown Section */}
      <section id="roles" className="py-20 px-4 bg-slate-100/50 dark:bg-slate-900/30 border-y border-slate-200/80 dark:border-slate-800/80">
        <div className="max-w-[1200px] mx-auto w-full">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
            <Badge variant="outline" className="text-xs">Role-Gated Architecture</Badge>
            <h2 className="text-3xl font-bold tracking-tight">Built for Students, Teachers & Admins</h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Strict server-enforced authorization and custom claims ensure security and distinct workflows.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Student</h3>
                  <p className="text-xs text-slate-500">Adaptive personalized learner</p>
                </div>
              </div>
              <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                <li>• Enroll in public classes or request private access</li>
                <li>• Your Skill Map and mastery radar</li>
                <li>• Interactive labs, flashcards and AI quizzes</li>
                <li>• Earn XP, streak days, and join peer lounges</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Teacher</h3>
                  <p className="text-xs text-slate-500">Curriculum & classroom director</p>
                </div>
              </div>
              <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                <li>• AI Syllabus Synthesis via Gemini</li>
                <li>• Manage public/private classes and join requests</li>
                <li>• Live class mastery heatmap (students x KCs)</li>
                <li>• Track token quotas and see each student&apos;s skill map</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Super Admin</h3>
                  <p className="text-xs text-slate-500">Platform administrator</p>
                </div>
              </div>
              <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                <li>• Global user management and role assignment</li>
                <li>• Approve teacher access requests</li>
                <li>• Monitor platform-wide token usage and costs</li>
                <li>• Disable accounts and manage platform health</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <footer className="mt-auto py-12 px-4 border-t border-slate-200/80 dark:border-slate-800/80">
        <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950 font-bold">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <span className="font-bold text-sm">Sunroot</span>
            <span className="text-xs text-slate-500">© 2026. All rights reserved.</span>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-500">
            <Link href="/login" className="hover:text-teal-600 dark:hover:text-teal-400">
              Sign In
            </Link>
            <Link href="/signup" className="hover:text-teal-600 dark:hover:text-teal-400">
              Create Account
            </Link>
            <Link href="/dashboard" className="hover:text-teal-600 dark:hover:text-teal-400">
              Student App
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
