"use client";

import React, { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Lab } from "@/components/experiments/lab";
import { experimentById } from "@/lib/experiments/defs";

export default function ExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const exp = experimentById(id);
  if (!exp) {
    return (
      <div className="space-y-3">
        <p className="text-sm">That experiment doesn&apos;t exist.</p>
        <Link href="/experiments" className="text-teal-600 font-semibold text-sm">Back to experiments</Link>
      </div>
    );
  }
  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Link href="/experiments" className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="Back to experiments"><ArrowLeft className="h-4 w-4" /></Link>
        <div>
          <p className="text-xs font-mono tracking-widest text-teal-600">{exp.subject.toUpperCase()}</p>
          <h1 className="text-xl font-extrabold">{exp.emoji} {exp.title}</h1>
        </div>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">{exp.blurb}</p>
      <Lab exp={exp} />
    </div>
  );
}
