import React from "react";
import Link from "next/link";
import { FEATURES, type FeatureGroup } from "@/lib/features/registry";
import { FeatureIcon } from "./feature-icon";

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
    <Link key={l.href + l.title} href={l.href} className={`block rounded-lg border bg-card transition-colors hover:border-teal-600 dark:hover:border-teal-400 ${big ? "p-5" : "p-4"} border-border`}>
      <div className="flex items-center gap-3">
        <FeatureIcon emoji={l.emoji} tile={big ? "h-10 w-10" : "h-9 w-9"} />
        <p className="font-semibold leading-tight">{l.title}</p>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{l.blurb}</p>
    </Link>
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">{eyebrow}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-slate-500 max-w-2xl">{intro}</p>
      </div>
      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Start with these</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{start.map((l) => card(l, true))}</div>
      </section>
      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">More</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{more.map((l) => card(l))}</div>
      </section>
    </div>
  );
}
