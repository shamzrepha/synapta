"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SavedRuns } from "@/components/experiments/saved-runs";
import { EXPERIMENTS } from "@/lib/experiments/defs";

export default function ExperimentsPage() {
  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center gap-2">
        <Link href="/more" className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="Back"><ArrowLeft className="h-4 w-4" /></Link>
        <div>
          <p className="text-xs font-mono tracking-widest text-teal-600">SCIENCE LAB</p>
          <h1 className="text-xl font-extrabold">Experiments</h1>
        </div>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">Change the settings, watch the graph respond, record readings in a table, answer a few guided questions, and save your runs to your account.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {EXPERIMENTS.map((e) => (
          <Link key={e.id} href={`/experiments/${e.id}`}>
            <Card className="p-4 h-full hover:border-teal-500 transition-colors">
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
      <div className="space-y-2">
        <h2 className="text-sm font-bold">My saved runs</h2>
        <SavedRuns />
      </div>
    </div>
  );
}
