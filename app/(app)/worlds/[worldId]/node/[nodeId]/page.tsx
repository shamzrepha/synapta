"use client";

import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LessonPlayer } from "@/components/worlds/lesson-player";
import { asArray } from "@/lib/api/client";
import type { Activity } from "@/lib/worlds/activities";
import type { Beat } from "@/lib/worlds/design";

interface NodeData {
  node: { id: string; title: string; estMinutes: number; beats: Beat[] };
  activities: Activity[];
  critical: string[];
}

export default function LessonPage({ params }: { params: Promise<{ worldId: string; nodeId: string }> }) {
  const { worldId, nodeId } = use(params);
  const router = useRouter();
  const [d, setD] = useState<NodeData | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    fetch(`/api/worlds/${worldId}/nodes/${nodeId}`)
      .then((r) => r.json())
      .then((j) => (j.ok ? setD(j.data) : setMissing(true)))
      .catch(() => setMissing(true));
  }, [worldId, nodeId]);

  if (missing) return <Card className="p-8 text-center">This lesson was not found. <Link href={`/worlds/${worldId}/learn`} className="underline">Back to the map</Link></Card>;
  if (!d) return <Skeleton className="h-96 w-full rounded-xl" />;
  return <LessonPlayer worldId={worldId} nodeId={nodeId} title={d.node.title} beats={asArray<Beat>(d.node.beats)} activities={asArray<Activity>(d.activities)} critical={asArray<string>(d.critical)} onExit={() => router.push(`/worlds/${worldId}/learn`)} />;
}
