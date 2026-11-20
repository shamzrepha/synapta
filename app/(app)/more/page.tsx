"use client";

import { FeatureIcon } from "@/components/shell/feature-icon";
import { ThemeMenu } from "@/components/settings/theme-panel";
import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { useUserStore } from "@/lib/store/use-user-store";
import { moreGroupsFor } from "@/lib/nav/more-groups";
import { asArray } from "@/lib/api/client";

/** Everything Sunroot can do, grouped by what you want to do. Each page appears once. */
export default function MorePage() {
  const { user } = useUserStore();
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    return moreGroupsFor(user?.role)
      .map((g) => ({ ...g, items: g.items.filter((f) => !t || `${f.title} ${f.blurb}`.toLowerCase().includes(t)) }))
      .filter((g) => g.items.length > 0);
  }, [q, user?.role]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-mono tracking-widest text-brand-600">SUNROOT</p>
          <h1 className="text-2xl font-extrabold">All features</h1>
          <p className="text-sm text-slate-500">Pick what you want to do.</p>
        </div>
        <ThemeMenu />
      </div>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search features" placeholder="Search features…" className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 text-sm" />
      </div>
      {groups.length === 0 && <p className="text-sm text-slate-500">Nothing matches. Try another word.</p>}
      {asArray(groups).map((g) => (
        <section key={g.name} aria-labelledby={`more-${g.name}`} className="space-y-2">
          <div>
            <h2 id={`more-${g.name}`} className="text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">{g.name}</h2>
            <p className="text-xs text-slate-500">{g.hint}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {asArray(g.items).map((f) => (
              <li key={f.id}>
                <Link href={f.href} className="block h-full min-h-[44px] rounded-2xl border border-slate-200 bg-white p-4 hover:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-800 dark:bg-slate-900">
                  <span className="flex items-center gap-2">
                    <FeatureIcon emoji={f.emoji} />
                    <span className="font-bold leading-tight">{f.title}</span>
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">{f.blurb}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
