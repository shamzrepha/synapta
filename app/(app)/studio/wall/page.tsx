"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { asArray } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { WallCard } from "@/components/studio/wall-bits";
import type { WallItem } from "@/lib/studio/wall";
import { CATALOG_BY_TYPE } from "@/lib/studio/circuit/catalog";

interface WallData {
  items: WallItem[];
  featured: WallItem[];
  parts: string[];
}

const KINDS = [
  { v: "", label: "All" },
  { v: "circuit", label: "Circuits" },
  { v: "mechanism", label: "Mechanisms" },
  { v: "assembly", label: "3D builds" },
];

export default function MakerWallPage() {
  const [kind, setKind] = useState("");
  const [part, setPart] = useState("");
  const [sort, setSort] = useState<"new" | "top">("new");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [result, setResult] = useState<{ key: string; data: WallData } | null>(null);
  const [allParts, setAllParts] = useState<string[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const key = `${kind}|${part}|${sort}|${debouncedQ}`;
  useEffect(() => {
    let live = true;
    const qs = new URLSearchParams();
    if (kind) qs.set("kind", kind);
    if (part) qs.set("part", part);
    if (debouncedQ) qs.set("q", debouncedQ);
    qs.set("sort", sort);
    fetch(`/api/studio/wall?${qs}`)
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        const data: WallData = j.ok ? { items: asArray<WallItem>(j.data.items), featured: asArray<WallItem>(j.data.featured), parts: asArray<string>(j.data.parts) } : { items: [], featured: [], parts: [] };
        setResult({ key, data });
        if (data.parts.length) setAllParts((prev) => (prev.length >= data.parts.length ? prev : data.parts));
      })
      .catch(() => live && setResult({ key, data: { items: [], featured: [], parts: [] } }));
    return () => {
      live = false;
    };
  }, [key, kind, part, sort, debouncedQ]);

  const loading = !result || result.key !== key;
  const data = result?.data;
  const filtering = !!(kind || part || debouncedQ);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/studio" className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="Back to Maker Studio">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-extrabold">🧱 Maker Wall</h1>
          <p className="text-xs text-slate-500">Projects built by learners, with demo videos and parts lists. Star, remix, build.</p>
        </div>
      </div>

      {!filtering && data && data.featured.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-extrabold flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-amber-500" /> Featured this week</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-3 px-3 snap-x">
            {data.featured.map((i) => (
              <div key={i.id} className="snap-start">
                <WallCard item={i} compact />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects" className="h-10 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 text-sm" aria-label="Search projects" />
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as "new" | "top")} className="h-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm" aria-label="Sort">
            <option value="new">Newest</option>
            <option value="top">Most loved</option>
          </select>
          <select value={part} onChange={(e) => setPart(e.target.value)} className="h-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm" aria-label="Parts used">
            <option value="">Any parts</option>
            {allParts.map((t) => (
              <option key={t} value={t}>{CATALOG_BY_TYPE[t]?.name || t}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button key={k.v} type="button" onClick={() => setKind(k.v)} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold border min-h-[36px]", kind === k.v ? "bg-teal-600 text-white border-teal-600" : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300")}>
              {k.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}</div>
        ) : data!.items.length === 0 ? (
          <Card className="p-8 text-center text-sm text-slate-500">
            {filtering ? "Nothing matches those filters." : "No projects yet. Open one of your designs, go to its Share tab and choose “Publish to the Maker Wall”."}
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data!.items.map((i) => (
              <WallCard key={i.id} item={i} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
