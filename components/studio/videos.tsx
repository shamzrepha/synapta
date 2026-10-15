"use client";

import React, { useEffect, useState } from "react";
import { PlayCircle, ExternalLink, Loader2 } from "lucide-react";
import { asArray } from "@/lib/api/client";

interface Video {
  id: string;
  title: string;
  channel: string;
  channelId: string;
  thumbnail: string;
}

const PREF_KEY = "studio:preferredChannel";

async function fetchVideos(q: string, prefer: string) {
  try {
    const j = await fetch(`/api/studio/videos?q=${encodeURIComponent(q)}${prefer ? `&prefer=${encodeURIComponent(prefer)}` : ""}`).then((r) => r.json());
    return j.ok ? { videos: asArray<Video>(j.data.videos), searchUrl: String(j.data.searchUrl), configured: !!j.data.configured } : null;
  } catch {
    return null;
  }
}

/**
 * Real YouTube lessons for a step. Remembers the creator you picked so later steps show the same
 * channel first (the survey's "one consistent source").
 */
export function StepVideos({ query }: { query: string }) {
  const [data, setData] = useState<{ videos: Video[]; searchUrl: string; configured: boolean } | null>(null);
  const [playing, setPlaying] = useState<Video | null>(null);

  useEffect(() => {
    let prefer = "";
    try {
      prefer = localStorage.getItem(PREF_KEY) || "";
    } catch {
      // storage unavailable
    }
    fetchVideos(query, prefer).then((d) => setData(d || { videos: [], searchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, configured: false }));
  }, [query]);

  if (!data) {
    return (
      <p className="flex items-center gap-2 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding videos…
      </p>
    );
  }
  if (data.videos.length === 0) {
    return (
      <a href={data.searchUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:underline">
        <PlayCircle className="h-4 w-4" /> Watch “{query}” on YouTube <ExternalLink className="h-3 w-3" />
      </a>
    );
  }
  return (
    <div className="space-y-2">
      {playing && (
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${playing.id}?rel=0`}
            title={playing.title}
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      )}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {data.videos.slice(0, 5).map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => {
              setPlaying(v);
              try {
                localStorage.setItem(PREF_KEY, v.channelId);
              } catch {
                // ignore
              }
            }}
            className="w-40 shrink-0 text-left"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={v.thumbnail} alt="" className="aspect-video w-full rounded-lg object-cover" loading="lazy" />
            <p className="mt-1 line-clamp-2 text-[11px] font-semibold leading-tight">{v.title}</p>
            <p className="text-[10px] text-slate-500 truncate">{v.channel}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
