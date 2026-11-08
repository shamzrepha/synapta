import React from "react";
import Link from "next/link";
import { FEATURES, type FeatureGroup } from "@/lib/features/registry";
import { INTENT_HINT, groupByIntent, intentOf, type Intent } from "@/lib/features/intents";
import { FeatureIcon } from "./feature-icon";

export interface HubLink {
  title: string;
  blurb: string;
  href: string;
  emoji: string;
  intent?: Intent;
}

/**
 * A landing page for one area. The few things to start with are large; everything else is grouped by what you are trying to do
 * (get material in, learn, practise, plan, build) as compact rows, so forty features read as five or six short lists.
 */
export function Hub({ eyebrow, title, intro, start, groups, extraLinks = [] }: { eyebrow: string; title: string; intro: string; start: HubLink[]; groups: FeatureGroup[]; extraLinks?: HubLink[] }) {
  const taken = new Set(start.map((s) => s.href));
  const more: Array<HubLink & { intent: Intent }> = [
    ...extraLinks.map((l) => ({ ...l, intent: l.intent ?? ("Learn" as Intent) })),
    ...FEATURES.filter((f) => f.status === "live" && groups.includes(f.group)).map((f) => ({ title: f.title, blurb: f.blurb, href: f.href, emoji: f.emoji, intent: intentOf(f) })),
  ].filter((m, i, a) => !taken.has(m.href) && a.findIndex((x) => x.href === m.href) === i);
  const sections = groupByIntent(more);

  const big = (l: HubLink) => (
    <Link key={l.href + l.title} href={l.href} className="group block rounded-lg border border-border bg-card p-5 transition-colors hover:border-brand-600 dark:hover:border-brand-400">
      <div className="flex items-center gap-3">
        <FeatureIcon emoji={l.emoji} tile="h-10 w-10" />
        <p className="font-semibold leading-tight">{l.title}</p>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{l.blurb}</p>
    </Link>
  );

  const row = (l: HubLink) => (
    <li key={l.href + l.title}>
      <Link href={l.href} className="group flex items-start gap-3 px-1 py-3 transition-colors hover:bg-muted/60 sm:px-2">
        <FeatureIcon emoji={l.emoji} tile="h-8 w-8" className="mt-0.5" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium leading-tight">{l.title}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{l.blurb}</span>
        </span>
      </Link>
    </li>
  );

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-brand-700 dark:text-brand-300">{eyebrow}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{intro}</p>
      </div>
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Start with these</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{start.map(big)}</div>
      </section>
      {sections.map((s) => (
        <section key={s.intent} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
            <h2 className="text-sm font-semibold">{s.intent}</h2>
            <p className="text-xs text-muted-foreground">{INTENT_HINT[s.intent]}</p>
          </div>
          <ul className="grid divide-y divide-border sm:grid-cols-2 sm:gap-x-8">{s.items.map(row)}</ul>
        </section>
      ))}
    </div>
  );
}
