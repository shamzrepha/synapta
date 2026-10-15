"use client";

import React from "react";
import Link from "next/link";
import { Cpu, Cog, Box, Star, GitFork, Play } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatNaira } from "@/lib/studio/bom";
import type { VideoRef, WallItem } from "@/lib/studio/wall";
import { cn } from "@/lib/utils";

export const KIND_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  circuit: { icon: <Cpu className="h-4 w-4" />, label: "Circuit + code", color: "text-emerald-600" },
  mechanism: { icon: <Cog className="h-4 w-4" />, label: "Mechanism", color: "text-amber-600" },
  assembly: { icon: <Box className="h-4 w-4" />, label: "3D assembly", color: "text-sky-600" },
};

export function VideoEmbed({ video, title }: { video: VideoRef; title: string }) {
  return (
    <div className="aspect-video w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-black">
      {video.kind === "upload" ? (
        <video src={video.embed} controls playsInline preload="metadata" className="h-full w-full" />
      ) : (
        <iframe
          src={video.embed}
          title={`${title} demo video`}
          loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="h-full w-full"
        />
      )}
    </div>
  );
}

export function WallCard({ item, compact }: { item: WallItem; compact?: boolean }) {
  const k = KIND_META[item.kind] || KIND_META.assembly;
  return (
    <Link href={`/studio/wall/${item.id}`} className="block">
      <Card className={cn("overflow-hidden h-full hover:border-teal-500/60 transition-colors", compact && "w-64 shrink-0")}>
        <div className="relative aspect-video bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
          {item.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span className={cn("opacity-60 scale-[2.5]", k.color)}>{k.icon}</span>
          )}
          {item.video && (
            <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/70 text-white text-[11px] font-semibold px-2 py-0.5">
              <Play className="h-3 w-3 fill-white" /> Demo
            </span>
          )}
        </div>
        <div className="p-3 space-y-1.5">
          <div className={cn("flex items-center gap-1.5 text-xs font-semibold", k.color)}>
            {k.icon} {k.label}
          </div>
          <p className="font-bold leading-tight line-clamp-1">{item.title}</p>
          <p className="text-xs text-slate-500 line-clamp-2">{item.description}</p>
          <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-0.5">
            <span className="truncate">{item.ownerName}</span>
            <span className="flex items-center gap-0.5 ml-auto"><Star className="h-3 w-3" />{item.starCount}</span>
            <span className="flex items-center gap-0.5"><GitFork className="h-3 w-3" />{item.forkCount}</span>
            {item.total > 0 && <span className="font-semibold text-slate-700 dark:text-slate-300">{formatNaira(item.total)}</span>}
          </div>
        </div>
      </Card>
    </Link>
  );
}
