"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookX, CheckCircle2, Layers, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { asArray } from "@/lib/api/client";
import { api, errMsg } from "@/lib/study/client";
import type { ReviewSummary } from "@/lib/review/queue";

const ICON = { cards: Layers, mistakes: BookX, topics: RotateCcw } as const;

export default function ReviewPage() {
  const [data, setData] = useState<ReviewSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    api<ReviewSummary>("/api/me/review-queue")
      .then((d) => alive && (setError(null), setData({ ...d, items: asArray(d.items), decks: asArray(d.decks), topics: asArray(d.topics) })))
      .catch((e) => alive && setError(errMsg(e)));
    return () => {
      alive = false;
    };
  }, [tick]);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-brand-700 dark:text-brand-300">Review</p>
        <h1 className="text-2xl font-semibold tracking-tight">Bring it back before you forget</h1>
        <p className="text-sm text-muted-foreground">Everything that is due or still open, in one place. Short reviews, spread out over days, are what make it stay.</p>
      </div>

      {!data && !error && <Skeleton className="h-40 w-full" />}
      {error && (
        <Card className="space-y-3 p-5 text-center">
          <p className="text-sm">{error}</p>
          <Button variant="outline" onClick={() => setTick((t) => t + 1)}><RefreshCw className="mr-2 h-4 w-4" /> Try again</Button>
        </Card>
      )}

      {data?.empty && (
        <Card className="space-y-2 p-6 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" aria-hidden="true" />
          <p className="text-lg font-semibold">Nothing is due right now</p>
          <p className="text-sm text-muted-foreground">New reviews appear here as you study. You can still practise.</p>
          <div className="flex justify-center gap-2 pt-1">
            <Link href="/study/daily"><Button>Practise some questions</Button></Link>
            <Link href="/study/notes"><Button variant="outline">Add material</Button></Link>
          </div>
        </Card>
      )}

      {data?.items.map((it) => {
        const Icon = ICON[it.id];
        return (
          <Card key={it.id} className="space-y-3 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-600/10 text-brand-700 dark:text-brand-300" aria-hidden="true"><Icon className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold leading-tight">{it.title} <span className="font-mono text-sm text-muted-foreground">· {it.count}</span></h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{it.detail}</p>
              </div>
            </div>
            {it.id === "cards" && data.decks.length > 0 && (
              <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                {data.decks.map((d) => (
                  <li key={d.id} className="flex min-h-[44px] items-center justify-between gap-3 px-3"><span className="truncate">{d.title}</span><span className="font-mono text-xs text-muted-foreground">{d.dueCount} due</span></li>
                ))}
              </ul>
            )}
            {it.id === "topics" && data.topics.length > 0 && (
              <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                {data.topics.map((t) => (
                  <li key={t.kcId}><Link href={`/classes/${t.classId}/topics/${t.kcId}`} className="flex min-h-[44px] items-center justify-between gap-3 px-3 hover:bg-muted/60"><span className="truncate">{t.title}</span><ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /></Link></li>
                ))}
              </ul>
            )}
            <Link href={it.href}><Button className="w-full sm:w-auto">{it.cta}</Button></Link>
          </Card>
        );
      })}
    </div>
  );
}
