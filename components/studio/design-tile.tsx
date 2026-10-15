"use client";

import React from "react";
import Link from "next/link";
import { Cpu, Cog, Box, Star, GitFork, GitCommit, Globe2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

export interface DesignCard {
  id: string;
  title: string;
  kind: "circuit" | "mechanism" | "assembly";
  summary: string;
  ownerName: string;
  starCount: number;
  forkCount: number;
  commitCount: number;
  updatedAt: string | null;
  visibility: string;
  challengeScore?: number | null;
}

const KIND: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  circuit: { icon: <Cpu className="h-4 w-4" />, label: "Circuit + code", color: "text-emerald-600" },
  mechanism: { icon: <Cog className="h-4 w-4" />, label: "Mechanism", color: "text-amber-600" },
  assembly: { icon: <Box className="h-4 w-4" />, label: "3D assembly", color: "text-sky-600" },
};

/** Card for a Maker Studio design (gallery, class labs, challenge entries). */
export function DesignTile({ d }: { d: DesignCard }) {
  const k = KIND[d.kind] || KIND.assembly;
  return (
    <Link href={`/studio/${d.id}`}>
      <Card className="p-4 h-full hover:border-teal-500/60 transition-colors space-y-2">
        <div className={cn("flex items-center gap-1.5 text-xs font-semibold", k.color)}>
          {k.icon} {k.label}
          {d.visibility === "public" && <Globe2 className="h-3 w-3 ml-auto text-slate-400" />}
        </div>
        <p className="font-bold leading-tight">{d.title}</p>
        {d.summary && <p className="text-xs text-slate-500 line-clamp-2">{d.summary}</p>}
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span>{d.ownerName}</span>
          <span className="flex items-center gap-0.5"><Star className="h-3 w-3" />{d.starCount}</span>
          <span className="flex items-center gap-0.5"><GitFork className="h-3 w-3" />{d.forkCount}</span>
          <span className="flex items-center gap-0.5"><GitCommit className="h-3 w-3" />{d.commitCount}</span>
          {d.updatedAt && <span className="ml-auto">{timeAgo(d.updatedAt)}</span>}
        </div>
      </Card>
    </Link>
  );
}

