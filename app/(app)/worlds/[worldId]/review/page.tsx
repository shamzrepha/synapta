"use client";

import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SessionRunner } from "@/components/worlds/session-runner";
import { asArray } from "@/lib/api/client";
import type { Activity } from "@/lib/worlds/activities";

export default function ReviewPage({ params }: { params: Promise<{ worldId: string }> }) {
  const { worldId } = use(params);
  const router = useRouter();
  const [d, setD] = useState<{ activities: Activity[]; due: number; critical: string[] } | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    fetch(`/api/worlds/${worldId}/queue`)
      .then((r) => r.json())
      .then((j) => (j.ok ? setD(j.data) : setMissing(true)))
      .catch(() => setMissing(true));
  }, [worldId]);

  if (missing) return <Card className="p-8 text-center">This world was not found. <Link href="/worlds" className="underline">Back to My Worlds</Link></Card>;
  if (!d) return <Skeleton className="h-96 w-full rounded-xl" />;
  const acts = asArray<Activity>(d.activities);
  if (acts.length === 0) {
    return (
      <Card className="p-8 text-center space-y-3 max-w-lg mx-auto">
        <p className="font-semibold">Nothing is due right now</p>
        <p className="text-sm text-muted-foreground">Finish a lesson on the map and its facts come back here at the right time.</p>
        <Link href={`/worlds/${worldId}/learn`} className="underline text-sm">Back to the map</Link>
      </Card>
    );
  }
  return <SessionRunner worldId={worldId} activities={acts} critical={asArray<string>(d.critical)} title="Ward Round" onExit={() => router.push(`/worlds/${worldId}/learn`)} finishLabel="Back to the map" />;
}
