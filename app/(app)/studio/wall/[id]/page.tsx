"use client";

import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, GitFork, Printer, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { VideoEmbed, KIND_META } from "@/components/studio/wall-bits";
import { formatNaira, type Bom } from "@/lib/studio/bom";
import type { WallItem } from "@/lib/studio/wall";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

interface Detail {
  item: WallItem;
  bom: Bom;
  starred: boolean;
  isOwner: boolean;
  forkedFrom: { id: string; title: string } | null;
}

export default function WallProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/studio/wall/${id}`)
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j.ok) setD(j.data);
        else setError(j.error?.message || "Couldn't open this project.");
      })
      .catch(() => live && setError("Couldn't open this project."));
    return () => {
      live = false;
    };
  }, [id]);

  const star = async () => {
    if (!d) return;
    const j = await fetch(`/api/studio/designs/${id}/star`, { method: "POST" }).then((r) => r.json()).catch(() => null);
    if (j?.ok) setD({ ...d, starred: j.data.starred, item: { ...d.item, starCount: d.item.starCount + (j.data.starred ? 1 : -1) } });
  };
  const fork = async () => {
    const j = await fetch(`/api/studio/designs/${id}/fork`, { method: "POST" }).then((r) => r.json()).catch(() => null);
    if (j?.ok) router.push(`/studio/${j.data.id}`);
    else toast({ title: "Couldn't remix", description: j?.error?.message, variant: "destructive" });
  };

  if (error) {
    return (
      <Card className="p-8 text-center text-sm space-y-3">
        <p>{error}</p>
        <Link href="/studio/wall" className="text-teal-600 font-semibold">Back to the Maker Wall</Link>
      </Card>
    );
  }
  if (!d) return <Skeleton className="h-96 rounded-2xl" />;
  const { item, bom } = d;
  const k = KIND_META[item.kind] || KIND_META.assembly;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <Link href="/studio/wall" className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="Back to the Maker Wall">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold leading-tight truncate">{item.title}</h1>
          <p className="text-xs text-slate-500 truncate">
            by {item.ownerName} · {timeAgo(item.publishedAt)}
            {d.forkedFrom && (
              <>
                {" "}· remix of <Link href={`/studio/wall/${d.forkedFrom.id}`} className="underline">{d.forkedFrom.title}</Link>
              </>
            )}
          </p>
        </div>
      </div>

      {item.video ? (
        <VideoEmbed video={item.video} title={item.title} />
      ) : item.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.coverUrl} alt="" className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 object-cover max-h-[420px]" />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("flex items-center gap-1.5 text-xs font-semibold", k.color)}>{k.icon} {k.label}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={star} aria-label={d.starred ? "Remove star" : "Star"}>
            <Star className={cn("h-4 w-4", d.starred && "fill-amber-400 text-amber-400")} /> <span className="ml-1">{item.starCount}</span>
          </Button>
          <Button size="sm" variant="outline" onClick={fork}>
            <GitFork className="h-4 w-4 mr-1" /> Remix · {item.forkCount}
          </Button>
          <Link href={`/studio/${id}`}>
            <Button size="sm">Open in Studio</Button>
          </Link>
        </div>
      </div>

      <Card className="p-4 space-y-2">
        <h2 className="font-extrabold">About this build</h2>
        <p className="text-sm whitespace-pre-wrap">{item.description}</p>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="font-extrabold">Parts list</h2>
          <Link href={`/studio/${id}/guide`} className="ml-auto text-xs font-semibold text-teal-600 flex items-center gap-1">
            <Printer className="h-3.5 w-3.5" /> Build guide
          </Link>
        </div>
        {bom.lines.length === 0 ? (
          <p className="text-sm text-slate-500">This project has no circuit parts to buy.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[300px]">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="px-1 py-1 w-10">Qty</th>
                  <th className="px-1 py-1">Part</th>
                  <th className="px-1 py-1 text-right">Each</th>
                  <th className="px-1 py-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {bom.lines.map((l) => (
                  <tr key={l.type} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-1 py-1.5 font-semibold">{l.qty}×</td>
                    <td className="px-1 py-1.5">{l.name}</td>
                    <td className="px-1 py-1.5 text-right text-slate-500">{formatNaira(l.unit)}</td>
                    <td className="px-1 py-1.5 text-right">{formatNaira(l.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 dark:border-slate-700 font-extrabold">
                  <td colSpan={3} className="px-1 py-2">Estimated total</td>
                  <td className="px-1 py-2 text-right">{formatNaira(bom.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="text-[11px] text-slate-500">Prices are Maker Space shop estimates.</p>
      </Card>
    </div>
  );
}
