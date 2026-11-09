"use client";

import React, { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LearningMap, type MapItem } from "@/components/classes/learning-map";
import { asArray } from "@/lib/api/client";
import { AskNotes } from "@/components/worlds/ask-notes";

interface MapData {
  world: { id: string; title: string; status: string; disclaimer: string | null; conflictCount: number };
  zones: Array<{ id: string; title: string; nodeIds: string[] }>;
  nodes: Array<{ id: string; title: string; zoneId: string; factCount: number; estMinutes: number; done: boolean; mastery: number; started: boolean }>;
  due: number;
  xp: number;
}

export default function WorldMapPage({ params }: { params: Promise<{ worldId: string }> }) {
  const { worldId } = use(params);
  const [d, setD] = useState<MapData | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    fetch(`/api/worlds/${worldId}/map`)
      .then((r) => r.json())
      .then((j) => (j.ok ? setD(j.data) : setMissing(true)))
      .catch(() => setMissing(true));
  }, [worldId]);

  const items = useMemo<MapItem[]>(() => {
    if (!d) return [];
    const zoneTitle = new Map(asArray<MapData["zones"][number]>(d.zones).map((z) => [z.id, z.title]));
    const order = asArray<MapData["zones"][number]>(d.zones).flatMap((z) => z.nodeIds);
    return asArray<MapData["nodes"][number]>(d.nodes)
      .map((n) => ({
        id: n.id,
        order: Math.max(0, order.indexOf(n.id)),
        pL: n.done ? Math.max(n.mastery, 0.5) : n.mastery,
        attempts: n.done ? 2 : n.started ? 1 : 0,
        title: n.title,
        description: `${zoneTitle.get(n.zoneId) ?? ""} · ${n.factCount} facts · about ${n.estMinutes} min`,
      }))
      .sort((a, b) => a.order - b.order);
  }, [d]);

  if (missing) return <Card className="p-8 text-center">This world was not found. <Link href="/worlds" className="underline">Back to My Worlds</Link></Card>;
  if (!d) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (d.world.status === "building") return <Card className="p-8 text-center space-y-3"><p>Your world is still being built.</p><Link href={`/worlds/${worldId}`}><Button>Open my library</Button></Link></Card>;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <Link href={`/worlds/${worldId}`} className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4 mr-1" /> My library</Link>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight truncate">{d.world.title}</h1>
          <p className="text-sm text-muted-foreground">{d.xp} XP from this world</p>
        </div>
        <Link href={`/worlds/${worldId}/review`}>
          <Button variant={d.due > 0 ? "default" : "outline"}><Repeat className="h-4 w-4 mr-1.5" /> {d.due > 0 ? `Review ${d.due} due` : "Practice"}</Button>
        </Link>
      </div>
      {d.world.disclaimer && <p className="text-xs text-muted-foreground rounded-lg border border-border bg-muted/40 px-3 py-2" role="note">{d.world.disclaimer}</p>}
      {d.world.conflictCount > 0 && (
        <Link href={`/worlds/${worldId}`} className="block rounded-lg border border-orange-500/50 bg-orange-500/10 px-3 py-2 text-sm">Your notes disagree on {d.world.conflictCount} thing{d.world.conflictCount === 1 ? "" : "s"}. Tap to choose which is right.</Link>
      )}
      <AskNotes worldId={worldId} />
      {items.length === 0 ? <Card className="p-8 text-center text-sm text-muted-foreground">There are no lessons yet. Add more notes to your library.</Card> : <LearningMap classId={worldId} items={items} hrefFor={(id) => `/worlds/${worldId}/node/${id}`} />}
    </div>
  );
}
