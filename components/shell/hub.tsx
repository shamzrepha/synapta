import React from "react";
import Link from "next/link";
import { FEATURES, type FeatureGroup } from "@/lib/features/registry";

export interface HubLink {
  title: string;
  blurb: string;
  href: string;
  emoji: string;
}

/** A landing page for one area: the few things to start with, then everything else that belongs there. */
export function Hub({ eyebrow, title, intro, start, groups, extraLinks = [] }: { eyebrow: string; title: string; intro: string; start: HubLink[]; groups: FeatureGroup[]; extraLinks?: HubLink[] }) {
  const taken = new Set(start.map((s) => s.href));
  const more: HubLink[] = [
    ...extraLinks,
    ...FEATURES.filter((f) => f.status === "live" && groups.includes(f.group)).map((f) => ({ title: f.title, blurb: f.blurb, href: f.href, emoji: f.emoji })),
  ].filter((m, i, a) => !taken.has(m.href) && a.findIndex((x) => x.href === m.href) === i);

  const card = (l: HubLink, big = false) => (
    <Link key={l.href + l.title} href={l.href} className={`block rounded-2xl border bg-white dark:bg-slate-900 hover:border-teal-500 ${big ? "p-5 border-teal-500/40" : "p-4 border-slate-200 dark:border-slate-800"}`}>
      <div className="flex items-center gap-2">
        <span className={big ? "text-3xl" : "text-2xl"} aria-hidden>{l.emoji}</span>
        <p className="font-bold leading-tight">{l.title}</p>
      </div>
      <p className="text-xs text-slate-500 mt-1">{l.blurb}</p>
    </Link>
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-mono tracking-widest text-teal-600">{eyebrow}</p>
        <h1 className="text-2xl font-extrabold">{title}</h1>
        <p className="text-sm text-slate-500 max-w-2xl">{intro}</p>
      </div>
      <section className="space-y-2">
        <h2 className="font-bold text-sm uppercase tracking-wide text-slate-400">Start with these</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{start.map((l) => card(l, true))}</div>
      </section>
      <section className="space-y-2">
        <h2 className="font-bold text-sm uppercase tracking-wide text-slate-400">More</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{more.map((l) => card(l))}</div>
      </section>
    </div>
  );
}
