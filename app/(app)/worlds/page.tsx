"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Globe2, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { asArray } from "@/lib/api/client";

interface WorldRow {
  id: string;
  title: string;
  status: "empty" | "building" | "ready";
  stats?: { kuCount: number; conceptCount: number; docCount: number; conflictCount: number };
}

export default function WorldsPage() {
  const [worlds, setWorlds] = useState<WorldRow[] | null>(null);
  useEffect(() => {
    fetch("/api/worlds")
      .then((r) => r.json())
      .then((j) => setWorlds(j.ok ? asArray<WorldRow>(j.data.worlds) : []))
      .catch(() => setWorlds([]));
  }, []);

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2"><Globe2 className="h-6 w-6 text-brand-600" /> My Worlds</h1>
          <p className="text-sm text-muted-foreground">Your notes, merged into one library and turned into something you can learn by doing.</p>
        </div>
        <Link href="/worlds/new"><Button><Plus className="h-4 w-4 mr-1.5" /> New world</Button></Link>
      </div>
      {worlds === null ? (
        <Skeleton className="h-28 w-full rounded-xl" />
      ) : worlds.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <p className="font-semibold">No worlds yet</p>
          <p className="text-sm text-muted-foreground">Upload a PDF, a Word note or photos of handwritten pages. Add more notes on the same topic later and they are merged.</p>
          <Link href="/worlds/new"><Button>Upload my notes</Button></Link>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {worlds.map((w) => (
            <Link key={w.id} href={`/worlds/${w.id}`}>
              <Card className="p-4 space-y-1 hover:border-brand-500/60 transition-colors">
                <p className="font-semibold truncate">{w.title}</p>
                <p className="text-xs text-muted-foreground">
                  {w.status === "building" ? "Building…" : `${w.stats?.kuCount ?? 0} facts · ${w.stats?.docCount ?? 0} notes`}
                  {(w.stats?.conflictCount ?? 0) > 0 ? ` · ${w.stats?.conflictCount} to confirm` : ""}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
