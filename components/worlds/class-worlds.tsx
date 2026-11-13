"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Globe2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { asArray } from "@/lib/api/client";

interface Row {
  id: string;
  title: string;
  status: string;
  stats?: { kuCount: number; docCount: number };
}

/** Worlds built from the teacher's notes for this class. Students play them; the teacher builds and adds notes. */
export function ClassWorlds({ classId, canManage }: { classId: string; canManage: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    fetch(`/api/worlds?classId=${classId}`)
      .then((r) => r.json())
      .then((j) => setRows(j.ok ? asArray<Row>(j.data.worlds) : []))
      .catch(() => setRows([]));
  }, [classId]);
  if (rows === null || (rows.length === 0 && !canManage)) return null;
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <p className="font-bold flex-1 flex items-center gap-2"><Globe2 className="h-4 w-4 text-brand-600" /> Worlds from your notes</p>
        {canManage && <Link href={`/worlds/new?class=${classId}`}><Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" /> Build from library</Button></Link>}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Build a game your students can learn in straight from the notes already in your subject library: nothing to upload again. More notes on the same topic are merged.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {rows.map((w) => (
            <Link key={w.id} href={canManage ? `/worlds/${w.id}` : `/worlds/${w.id}/learn`} className="rounded-lg border border-border px-3 py-2 text-sm hover:border-brand-500/60">
              <span className="font-medium block truncate">{w.title}</span>
              <span className="text-xs text-muted-foreground">{w.status === "building" ? "Building…" : `${w.stats?.kuCount ?? 0} facts`}</span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
