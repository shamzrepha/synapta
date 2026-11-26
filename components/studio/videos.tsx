"use client";

import React, { useEffect, useState, useMemo } from "react";
import { PlayCircle, ExternalLink, Loader2, ThumbsUp, Sparkles, Award } from "lucide-react";
import { asArray } from "@/lib/api/client";
import {
  rankVideosForStudent,
  type VideoItem,
  type StudentSignals,
  type RankedVideo,
} from "@/lib/videos/ranking";

const PREF_KEY = "studio:preferredChannel";
const SIGNALS_KEY = "sunroot:video_signals";
const STYLE_KEY = "sunroot:learning_style";

async function fetchVideos(q: string, prefer: string) {
  try {
    const j = await fetch(
      `/api/studio/videos?q=${encodeURIComponent(q)}${prefer ? `&prefer=${encodeURIComponent(prefer)}` : ""}`
    ).then((r) => r.json());
    return j.ok
      ? {
          videos: asArray<VideoItem>(j.data.videos),
          searchUrl: String(j.data.searchUrl),
          configured: !!j.data.configured,
        }
      : null;
  } catch {
    return null;
  }
}

function loadStoredSignals(): StudentSignals {
  if (typeof window === "undefined") return {};
  try {
    const rawSignals = localStorage.getItem(SIGNALS_KEY);
    const engagements = rawSignals ? JSON.parse(rawSignals) : {};
    const learningStyle = localStorage.getItem(STYLE_KEY) || undefined;
    return { learningStyle, engagements };
  } catch {
    return {};
  }
}

function recordHelpfulTap(videoId: string) {
  try {
    const raw = localStorage.getItem(SIGNALS_KEY);
    const data = raw ? JSON.parse(raw) : {};
    const current = data[videoId] || { videoId };
    current.helpfulTaps = (current.helpfulTaps || 0) + 1;
    data[videoId] = current;
    localStorage.setItem(SIGNALS_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

/**
 * Real YouTube lessons for a topic/step.
 * Ranked per student:
 * - Teacher recommended video stays first: "Recommended by your teacher"
 * - Other videos ranked by student learning style & signals: "Picked for how you learn"
 */
export function StepVideos({
  query,
  teacherRecommendedId,
}: {
  query: string;
  teacherRecommendedId?: string;
}) {
  const [data, setData] = useState<{
    videos: VideoItem[];
    searchUrl: string;
    configured: boolean;
  } | null>(null);
  const [playing, setPlaying] = useState<RankedVideo | null>(null);
  const [signals, setSignals] = useState<StudentSignals>(loadStoredSignals);

  useEffect(() => {
    let prefer = "";
    try {
      prefer = localStorage.getItem(PREF_KEY) || "";
    } catch {
      // storage unavailable
    }
    fetchVideos(query, prefer).then((d) =>
      setData(
        d || {
          videos: [],
          searchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
          configured: false,
        }
      )
    );
  }, [query]);

  const rankedVideos: RankedVideo[] = useMemo(() => {
    if (!data || data.videos.length === 0) return [];
    const formatted = data.videos.map((v, idx) => ({
      ...v,
      teacherRecommended: teacherRecommendedId ? v.id === teacherRecommendedId : idx === 0,
    }));
    return rankVideosForStudent(formatted, signals);
  }, [data, teacherRecommendedId, signals]);

  if (!data) {
    return (
      <p className="flex items-center gap-2 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding videos…
      </p>
    );
  }
  if (data.videos.length === 0) {
    return (
      <a
        href={data.searchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:underline"
      >
        <PlayCircle className="h-4 w-4" /> Watch “{query}” on YouTube <ExternalLink className="h-3 w-3" />
      </a>
    );
  }

  return (
    <div className="space-y-3">
      {playing && (
        <div className="space-y-2">
          <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${playing.id}?rel=0`}
              title={playing.title}
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="h-full w-full"
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {playing.badge === "Recommended by your teacher" ? (
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <Award className="h-3.5 w-3.5" /> Recommended by your teacher
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400">
                  <Sparkles className="h-3.5 w-3.5" /> Picked for how you learn
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                recordHelpfulTap(playing.id);
                setSignals(loadStoredSignals());
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300 font-medium"
            >
              <ThumbsUp className="h-3.5 w-3.5 text-brand-600" /> Helpful
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2.5 overflow-x-auto pb-1.5 pt-0.5">
        {rankedVideos.slice(0, 5).map((v) => {
          const isTeacher = v.badge === "Recommended by your teacher";
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                setPlaying(v);
                try {
                  if (v.channelId) localStorage.setItem(PREF_KEY, v.channelId);
                } catch {
                  // ignore
                }
              }}
              className="w-44 shrink-0 text-left group flex flex-col justify-between rounded-xl border border-slate-200/80 dark:border-slate-800 p-2 hover:border-brand-500/50 transition-all bg-white dark:bg-slate-950/40"
            >
              <div>
                <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={v.thumbnail}
                    alt=""
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors">
                    <PlayCircle className="h-7 w-7 text-white drop-shadow" />
                  </div>
                </div>

                <div className="mt-1.5">
                  {isTeacher ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400 px-1.5 py-0.5 rounded">
                      <Award className="h-2.5 w-2.5" /> Recommended by your teacher
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-brand-700 bg-brand-50 dark:bg-brand-950/40 dark:text-brand-400 px-1.5 py-0.5 rounded">
                      <Sparkles className="h-2.5 w-2.5" /> Picked for how you learn
                    </span>
                  )}
                </div>

                <p className="mt-1 line-clamp-2 text-[11px] font-semibold leading-snug text-slate-800 dark:text-slate-100">
                  {v.title}
                </p>
              </div>

              <p className="mt-1 text-[10px] text-slate-500 truncate">
                {v.channel || "YouTube"}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
