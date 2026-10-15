"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FEATURES, type FeatureGroup } from "@/lib/features/registry";
import { cn } from "@/lib/utils";

const GROUPS: Array<FeatureGroup | "All"> = ["All", "Study", "Social", "Maker", "Rewards", "Teachers", "Everywhere"];

/** Everything Sunroot can do, in one place. */
export default function MorePage() {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<FeatureGroup | "All">("All");
  const items = useMemo(() => {
    const t = q.trim().toLowerCase();
    return FEATURES.filter((f) => (group === "All" || f.group === group) && (!t || `${f.title} ${f.blurb}`.toLowerCase().includes(t)));
  }, [q, group]);
  const live = FEATURES.filter((f) => f.status === "live").length;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-mono tracking-widest text-teal-600">SUNROOT</p>
        <h1 className="text-2xl font-extrabold">All features</h1>
        <p className="text-sm text-slate-500">{live} of {FEATURES.length} are live.</p>
      </div>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search features…" className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 text-sm" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {GROUPS.map((g) => (
          <button key={g} type="button" onClick={() => setGroup(g)} className={cn("rounded-full px-3 py-1 text-xs font-semibold border", group === g ? "bg-teal-600 text-white border-teal-600" : "border-slate-200 dark:border-slate-700")}>{g}</button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((f) => {
          const body = (
            <div className={cn("h-full rounded-2xl border p-4 space-y-1 bg-white dark:bg-slate-900", f.status === "live" ? "border-slate-200 dark:border-slate-800 hover:border-teal-500" : "border-dashed border-slate-300 dark:border-slate-700 opacity-70")}>
              <div className="flex items-center gap-2">
                <span className="text-2xl" aria-hidden>{f.emoji}</span>
                <p className="font-bold leading-tight flex-1">{f.title}</p>
                {f.status === "soon" && <Badge variant="outline" className="text-[10px]">soon</Badge>}
              </div>
              <p className="text-xs text-slate-500">{f.blurb}</p>
            </div>
          );
          return f.status === "live" ? <Link key={f.id} href={f.href}>{body}</Link> : <div key={f.id}>{body}</div>;
        })}
      </div>
    </div>
  );
}
