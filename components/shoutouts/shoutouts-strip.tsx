"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/community/client";
import { asArray } from "@/lib/api/client";
import { badgeInfo } from "@/lib/shoutouts/rules";

interface Item {
  id: string;
  badge: string;
  emoji: string;
  message: string;
  from: { displayName: string };
}

/**
 * Compact "shout-outs received" strip for a profile page.
 * Usage: <ShoutoutsStrip userRef={uid} />  (userRef is the profile owner's uid)
 */
export function ShoutoutsStrip({ userRef, limit = 3 }: { userRef: string; limit?: number }) {
  const [data, setData] = useState<{ items: Item[]; counts: Record<string, number>; total: number } | null>(null);

  useEffect(() => {
    let alive = true;
    api<{ shoutouts: Item[]; counts: Record<string, number>; total: number }>(`/api/shoutouts?view=received&uid=${encodeURIComponent(userRef)}`)
      .then((d) => alive && setData({ items: asArray<Item>(d.shoutouts), counts: d.counts || {}, total: d.total || 0 }))
      .catch(() => alive && setData({ items: [], counts: {}, total: 0 }));
    return () => {
      alive = false;
    };
  }, [userRef]);

  if (!data || data.total === 0) return null;
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800/80 dark:bg-slate-900/60">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Shout-outs 💌 <span className="font-normal text-slate-500">({data.total})</span></h3>
        <Link href="/shoutouts" className="text-xs font-semibold text-teal-600 hover:underline">Send one</Link>
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {Object.entries(data.counts).map(([badge, n]) => (
          <span key={badge} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium dark:bg-slate-800">
            {badgeInfo(badge).emoji} {badgeInfo(badge).label} · {n}
          </span>
        ))}
      </div>
      <ul className="space-y-1.5">
        {data.items.slice(0, limit).map((s) => (
          <li key={s.id} className="text-sm">
            <span className="font-semibold">{s.from.displayName}:</span> <span className="text-slate-600 dark:text-slate-300">{s.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
