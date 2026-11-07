"use client";

import React from "react";
import Link from "next/link";
import { Box, SlidersHorizontal, Sparkles, GraduationCap, ArrowRight, Zap, Bot, BrainCircuit } from "lucide-react";

const STUDIOS = [
  {
    title: "3D Circuits & Studio",
    tag: "3D Digital Twin",
    tagColor: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    desc: "Wire breadboards, connect sensors & motor drivers, write Arduino C++ logic, and run robotic simulations in 3D.",
    icon: Box,
    iconColor: "text-amber-500 bg-amber-500/10",
    borderHover: "hover:border-amber-500/50 hover:shadow-amber-500/10",
    href: "/studio",
    cta: "Launch Studio",
  },
  {
    title: "Interactive Science Labs",
    tag: "Hands-on Physics",
    tagColor: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20",
    desc: "Manipulate Ohm's law, kinematics, and molecular models with live interactive sliders and dynamic graph telemetry.",
    icon: SlidersHorizontal,
    iconColor: "text-teal-600 dark:text-teal-400 bg-teal-500/10",
    borderHover: "hover:border-teal-500/50 hover:shadow-teal-500/10",
    href: "/study",
    cta: "Open Labs",
  },
  {
    title: "Smart Notes & AI Tutor",
    tag: "2-Voice Audio",
    tagColor: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    desc: "Upload any syllabus, lecture PDF, or snap handwritten notes to generate audio podcasts and interactive step solvers.",
    icon: Sparkles,
    iconColor: "text-amber-500 bg-amber-500/10",
    borderHover: "hover:border-amber-500/50 hover:shadow-amber-500/10",
    href: "/study/notes",
    cta: "Upload Notes",
  },
  {
    title: "Classes & Mastery Radar",
    tag: "Exam Readiness",
    tagColor: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20",
    desc: "Follow your teacher's syllabus, complete assignments, and track your verified topic mastery score across every concept.",
    icon: GraduationCap,
    iconColor: "text-teal-600 dark:text-teal-400 bg-teal-500/10",
    borderHover: "hover:border-teal-500/50 hover:shadow-teal-500/10",
    href: "/classes/manage",
    cta: "View Classes",
  },
];

/**
 * Creative Studios & Interactive Workshop Hub (Tinkercad-style CAD / Labs / Audio / Mastery).
 * Provides clear tactile cards with smooth micro-interactions, distinct tags, and clean navigation.
 */
export function LearnAnything() {
  return (
    <section aria-label="Interactive Studios and Learning Workshops" className="space-y-3 pt-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-teal-500" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Creative Studios &amp; Learning Hub
          </h2>
        </div>
        <span className="text-xs text-muted-foreground hidden sm:inline">
          Hands-on simulation &middot; 3D Twins &middot; AI Tutors
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STUDIOS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-2xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md ${item.borderHover}`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${item.iconColor}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wide uppercase border ${item.tagColor}`}>
                    {item.tag}
                  </span>
                </div>

                <div>
                  <h3 className="font-bold text-sm text-foreground group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                    {item.desc}
                  </p>
                </div>
              </div>

              <div className="pt-4 mt-3 border-t border-border/60 flex items-center justify-between text-xs font-bold text-teal-600 dark:text-teal-400 group-hover:translate-x-0.5 transition-transform">
                <span>{item.cta}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
