"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Heart, Play, Trash2, Volume2, VolumeX } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useAutoplayAllowed } from "@/components/settings/use-prefs";
import { cn } from "@/lib/utils";

export interface ExplainerItem {
  id: string;
  title: string;
  tags: string[];
  videoUrl: string;
  durationSec: number;
  likeCount: number;
  liked: boolean;
  createdAt: string;
  owner: { uid: string; displayName: string; photoURL: string | null };
  isMine: boolean;
}

export function ExplainerCard({ item, onLike, onDelete }: { item: ExplainerItem; onLike: (id: string) => void; onDelete?: (id: string) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const autoplay = useAutoplayAllowed();
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);

  // Autoplay only while mostly on screen (and only if data saver / no-autoplay are off)
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && e.intersectionRatio >= 0.6) {
          if (autoplay) v.play().catch(() => null);
        } else {
          v.pause();
        }
      },
      { threshold: [0, 0.6, 1] }
    );
    io.observe(v);
    return () => io.disconnect();
  }, [autoplay]);

  const tap = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => null);
    } else {
      v.muted = !v.muted;
      setMuted(v.muted);
    }
  };

  return (
    <article className="snap-start rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="relative bg-black">
        <video
          ref={ref}
          src={item.videoUrl}
          muted
          loop
          playsInline
          preload={autoplay ? "metadata" : "none"}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onClick={tap}
          className="mx-auto max-h-[70vh] w-full object-contain aspect-[9/16] sm:aspect-video"
        />
        {!playing && (
          <button onClick={tap} aria-label="Play" className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-black/50 p-4 text-white">
              <Play className="h-7 w-7" />
            </span>
          </button>
        )}
        {playing && (
          <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/50 p-2 text-white">
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </span>
        )}
        {playing && muted && <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white">Tap to unmute</span>}
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-bold leading-snug">{item.title}</p>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <Avatar name={item.owner.displayName} photoURL={item.owner.photoURL} seed={item.owner.uid} size={20} />
              <span className="truncate">{item.isMine ? "You" : item.owner.displayName}</span>
              <span>· {Math.round(item.durationSec)}s</span>
            </div>
          </div>
          <button
            onClick={() => onLike(item.id)}
            aria-label={item.liked ? "Unlike" : "Like"}
            className={cn("flex h-9 items-center gap-1 rounded-xl px-2.5 text-sm font-semibold", item.liked ? "text-rose-600 bg-rose-500/10" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800")}
          >
            <Heart className={cn("h-4 w-4", item.liked && "fill-current")} /> {item.likeCount}
          </button>
          {onDelete && (
            <button onClick={() => onDelete(item.id)} aria-label="Delete explainer" className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-rose-500/10 hover:text-rose-600">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.tags.map((t) => (
              <Link key={t} href={`/explainers?tag=${t}`} className="rounded-full bg-teal-500/10 px-2 py-0.5 text-xs font-semibold text-teal-700 dark:text-teal-300">
                #{t}
              </Link>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
