"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SavedRuns } from "@/components/experiments/saved-runs";
import { ScienceWorkbenchGame } from "@/components/experiments/workbench-game";
import { EXPERIMENTS } from "@/lib/experiments/defs";

export default function ExperimentsPage() {
  return (
    <div className="space-y-6 pb-24 max-w-6xl mx-auto">
      <div className="flex items-center gap-2">
        <Link href="/more" className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="Back"><ArrowLeft className="h-4 w-4" /></Link>
        <div>
          <p className="text-xs font-mono tracking-widest text-brand-600">VIRTUAL SCIENCE & VERIFICATION LAB</p>
          <h1 className="text-xl sm:text-2xl font-extrabold">Interactive Chemistry, Fire & Physics Lab</h1>
        </div>
      </div>

      {/* Interactive "Cooking Fever"-Style Chemistry, Bunsen Burner Fire & Microscope Workbench */}
      <ScienceWorkbenchGame />

      <div className="space-y-3 pt-2">
        <div>
          <h2 className="text-base font-extrabold">Quantitative Physics & Chemistry Simulators</h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
            Change parameters, watch the live curve respond, record data table rows, and verify your calculations.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
        {EXPERIMENTS.map((e) => (
          <Link key={e.id} href={`/experiments/${e.id}`}>
            <Card className="p-4 h-full hover:border-brand-500 transition-colors">
              <div className="flex items-start gap-3">
                <span className="text-3xl" aria-hidden>{e.emoji}</span>
                <div className="min-w-0">
                  <p className="font-bold">{e.title}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{e.blurb}</p>
                  <Badge variant="outline" className="mt-2">{e.subject}</Badge>
                </div>
              </div>
            </Card>
          </Link>
        ))}
        </div>
      </div>
      <div className="space-y-2">
        <h2 className="text-sm font-bold">My saved runs</h2>
        <SavedRuns />
      </div>
    </div>
  );
}
